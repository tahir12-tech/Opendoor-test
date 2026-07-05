# hubspot-sync

Portal → HubSpot, one-way, **event-driven** sync. Implements `HUBSPOT-SYNC-SPEC.md`.
The portal is the system of record; HubSpot builds attribution/outreach on top.

## Shape

```
activity_log (since cursor)  ──►  translate via CONFIG  ──►  HubSpot v3/v4 upserts  ──►  advance cursor
     hubspot_pending_events        hubspot_sync_env               Applicants (custom obj)
     (row-value (at,id) watermark)  hubspot_field_map              Companies
                                    hubspot_partner_map            associations
```

One edge function (`index.ts`) consumes the portal's `activity_log` since a cursor, translates
each lifecycle event through **config tables** (property renames are config edits, not deploys),
and upserts Applicants + Companies + associations. Invoked like the other crons: via `pg_net`
with `x-ops-secret` (see below), or by a scheduled job.

## Config, not code

| Table | Purpose |
|---|---|
| `hubspot_sync_env` | Environment constant blocks. **One row `is_active`** (sandbox) + a dormant `production` row. Holds object type id, pipeline id, stage ids, and association type ids. **Promotion = flip `is_active`** — a config swap, no deploy. |
| `hubspot_field_map` | §3 mapping as data: portal fact → HubSpot internal property name, per `object` (applicant/company), with `source_kind` (col/const/derived/stage/pipeline/payment_status/event), `transform` (date/datetime/number), and the `events[]` that write it. |
| `hubspot_partner_map` | Per-partner resolution (§3): partner → the `partner_id` value written to Applicants + the `crm_company_key` of the partner company (the PRIMARY association target). |
| `hubspot_sync_cursor` | Single-row watermark over `(at,id)`. Initialised at go-live → **no backfill (§9)**. |
| `hubspot_sync_events` | Idempotency ledger keyed `(event id, target)` — `pandadoc_events` style. |

### Active (sandbox, Hub 148836842) vs dormant (production, Hub 144519077)

The spec §2 constants are **production**. This build is wired to the **sandbox**, so every id in the
active block was **read live from the sandbox Hub** (not copied from the spec):

| | sandbox (active) | production (dormant, §2) |
|---|---|---|
| applicants object | `2-205090657` | `2-203764825` |
| pipeline | `3897733314` | `3897733314` |
| stages Referred/Fee Paid/Deed Issued/Withdrawn | `5551028464` / `5552384196` / `5552384197` / `5552384198` | same |
| applicant→company assoc — partner (primary) | `19` (unlabeled/default) | read live at promotion (§7) |
| applicant→company assoc — branch | `23` | read live at promotion (§7) |
| company→company parent link | `14` ("Parent Company") | `14` |

The object type id differs (sandbox ≠ prod) — which is exactly why ids are read live and stored as
config rather than trusting the spec constants.

## Events (§4)

| activity_log kind | action |
|---|---|
| `referral_created` | upsert Applicant (all identity/property/tenancy) · stage **Referred** · `payment_status=Pending` · company sync + associations |
| `payment_received` | stage **Fee Paid** · `payment_status=Paid` · `fee_paid`, `stripe_payment_id` |
| `deed_signed` (alias `deed_issued`) | stage **Deed Issued** · `guarantee_issued`, `pandadoc_document_id`, `deed_download_url` |
| `deed_delivered` | `delivered_at`, `delivered_to` (no stage change) |
| `refunded` | **`payment_status=Refunded` only — stage does NOT move** |
| `withdrawn` | stage **Withdrawn** (terminal) |
| `tenancy_amended` | `tenancy_start_date` (HubSpot recomputes expiry) |

## Company sync (§6)

Only **confirmed** agencies/branches mint companies (`review_state='confirmed'` gate). Keys:
portal-born companies use `RFL:{first 8 of the portal UUID}` (collision-proof, stable across re-syncs).

- **Single-office** (agency + 1 confirmed branch): **ONE company**, agency-level (`company_level='Group HQ / Brand'`,
  `head_office_='Yes'`), keyed on the agency UUID; serves both agency and branch roles.
- **Multi-branch**: agency = parent (`Group HQ / Brand`, `network_group` ← agency group), branches = children
  (`company_level='Branch'`, `head_office_` per branch), parent-child linked (child → parent, type `14`).

`partner_id` is a **unique** company property in HubSpot, so the sync writes it **only on the partner
company** (Rightmove/Zoopla/…). RFL companies carry `crm_company_key` + names/level/head_office/network_group;
Applicants carry `partner_id` (attribution) and `agency_reference_number` (= the associated company key).

## Associations (§7) — owner ruling: exactly two edges

Every Applicant links to exactly **two** companies:

1. **The partner company** (Rightmove/Zoopla) — always, and **PRIMARY** (the one Workflow E reads).
   Made via the v4 default-association endpoint (unlabeled type `19`).
2. **The referring agent's BRANCH company** (labeled type `23`) — for a multi-branch group the applicant
   links to the specific **branch child** (e.g. the Croydon branch), *not* the group parent; for a
   single-office agency the single company plays the branch role.

There is **no direct applicant→parent edge**. Agency/group-level rollups traverse the **branch → parent**
company link (§6, type `14`), so attribution is preserved without a third edge. Two edges also fit the
sandbox's 2-companies-per-record association cap natively (no cap-raise needed).

Association state is tracked in a **per-application role ledger** (`assoc:{app_id}:partner` /
`:branch`), not per event. So if a referral lands before its org is confirmed (§1/§6), the partner edge is
made immediately and the branch edge is completed on the next event once the org is confirmed — the
missing edge is never lost to a coarse per-event ledger.

## Guardrails

- **§5 never-touch** — the sync writes only its own columns; a defensive `NEVER_TOUCH` filter drops
  `commission_owed`, `guarantee_expiry`, `attribution_status`, `commission_paid`, owner/team from any
  payload. HubSpot derives the calculations from the inputs the sync feeds (e.g. `commission_owed` =
  `fee_paid` × `applicant_commission_rate`).
- **§8 no Contacts** — the only object types written are the Applicant custom object and companies.
  The integration token has no contacts scope; tenants can never become Contacts.
- **§9 no backfill** — the cursor starts at go-live; pre-existing test debris is never in range.
- **Idempotency** — every action keys on `(event id, target)`; and every HubSpot write is idempotent by
  construction (upsert on a unique property; PUT association). The ledger row is recorded **after** the
  action succeeds, so a mid-event failure retries cleanly.
- **Failures** — `report_ops_incident('hubspot_sync_error', …)` (existing ops-alert channel); the cursor
  holds at the last success so the batch retries next run.

## Auth & invocation

`verify_jwt = false`. Auth: `x-ops-secret` matched against `REMINDERS_CRON_SECRET` (edge env) OR the
`ops_secrets` `reminders_cron` mirror — identical to `ops-alert` / the reminder crons. Token resolution:
`HUBSPOT_ACCESS_TOKEN` (edge env) → `x-hubspot-token` header → `ops_secrets` `hubspot_access_token`.

Invoke like a cron (secret never leaves the DB):

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/hubspot-sync',
  body := jsonb_build_object('limit', 200),
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-ops-secret',(select secret from public.ops_secrets where name='reminders_cron'))
);
```

## Promotion to production

1. Read the production Hub's live association type ids (§7): `GET /crm/v4/associations/2-203764825/companies/labels`
   → set `company_assoc_type_id` / `company_agency_type_id` / `company_branch_type_id` on the `production` row.
2. Set `HUBSPOT_ACCESS_TOKEN` (production private-app token) as the edge secret.
3. `update hubspot_sync_env set is_active = (env='production');` (the partial unique index enforces one active).
4. First real referral flows; the cursor's go-live watermark keeps history out.

## Proven against the sandbox (2026-07-05)

Drove a full application lifecycle and read every result back via the HubSpot API:

- **GR-20619** (single-office): `created → Referred/Pending` → `paid → Fee Paid/Paid, fee_paid=200,
  stripe_payment_id` → `deed → Deed Issued, guarantee_issued, pandadoc_document_id, deed_download_url`.
  `commission_owed` auto-derived by HubSpot to 19.000 (200 × 0.095 snapshotted rate); `guarantee_expiry`
  derived from `tenancy_start_date`; never-touch fields untouched. Minted ONE company `RFL:e0efeea4`
  (`Group HQ / Brand`, `head_office_=Yes`). Associated to Rightmove (primary) + the single company.
  **Refund** → `payment_status=Refunded`, stage stayed **Deed Issued**.
- **GR-20618** (multi-branch): minted agency parent `RFL:4e7ea536` (`network_group` set) + branch child
  `RFL:75c320ce` (`company_level=Branch`), parent-child linked (type 14). The applicant links to exactly
  two companies — Rightmove (primary) + the **Camden branch child** (`agency_reference_number=RFL:75c320ce`),
  **not** the group parent; the parent is reached through the branch→parent company link.
- **Idempotency**: rewinding the cursor and reprocessing all events was a no-op (no duplicates,
  `hs_lastmodifieddate` unchanged). **No backfill**: only the 2 test applicants exist.

## Known limitations / review notes

Surfaced by an adversarial review + proving live; each is deliberate for v1:

- **Confirmation as an explicit trigger is partial.** Confirmations are written to `org_audit`, not
  `activity_log`, so the sync isn't event-driven off them. A branch confirmed *after* its referral is
  completed on the applicant's **next** lifecycle event (the per-application role ledger makes this safe
  and idempotent). An applicant that never emits another event after such a late confirmation would keep
  its branch edge pending until it does — full backfill (consuming `org_audit` confirmations) is a
  natural v1.1 addition.
- **Cursor is a `(at,id)` watermark.** `activity_log.at` defaults to `now()`; a row that commits late with
  a backdated `at` (cross-transaction clock skew) could be skipped. Very low risk for short-lived
  now()-stamped edge-function inserts; the idempotency ledger makes a trailing-window re-scan safe if this
  ever needs hardening.
- **`delivered_at` / `referral_received_date` are written at date granularity** (midnight UTC) because the
  sandbox properties are date-picker (date fieldType) fields, which HubSpot requires be midnight UTC.
- **`delivered_to`** is resolved to the branch/agency *current* primary contact (best-effort), not parsed
  from the delivery event's message text.
- **Reinstatement / expiry** (`reinstated`, `expired`) are not synced — not listed in §4.
- Company **`partner_id` is written only on the partner company** (it is a *unique* HubSpot property, so it
  cannot also live on RFL companies); portal orgs hold no address fields, so none are written.
