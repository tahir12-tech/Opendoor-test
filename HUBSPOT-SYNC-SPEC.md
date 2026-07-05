# HubSpot Sync Specification — Guarantee Referral Portal

**Status:** ready to build (post-handover, Balal). All constants verified against the live Hub on 5 July 2026.
**Hub:** 144519077 (EU). **Direction:** portal → HubSpot, one-way. The portal is the system of record for applications and org structure; HubSpot builds everything on top.

---

## 1. Architecture

An event-driven feed, not a batch mirror. The portal's activity log already emits every lifecycle moment (referral created, fee paid, deed issued, deed delivered, refund, withdrawal). One sync function consumes those events and translates them through a **mapping table stored as config, not code** (portal field → HubSpot internal name), so property renames become config edits, not deploys.

- **Upsert key (Applicant):** `applicant_id` ← the portal's guarantee_ref (GR-xxxxx). Replays and retries upsert, never duplicate.
- **Upsert key (Company):** `crm_company_key` (see §6).
- **Only confirmed entities sync.** The Reconciliation queue is the CRM's gatekeeper: pending_review agencies/branches never mint companies. Confirmation is the sync trigger for org records.
- **Idempotency:** every sync action keys on (event id, target record). The portal's event dedup patterns (pandadoc_events style) are the model.

## 2. Constants (verified live, 5 Jul 2026)

| Thing | Value |
|---|---|
| Applicant object | `2-203764825` |
| Pipeline ("Rightmove Trial Pipeline") | `3897733314` |
| Stage: Referred | `5551028464` |
| Stage: Fee Paid | `5552384196` |
| Stage: Deed Issued | `5552384197` |
| Stage: Withdrawn | `5552384198` |

Pipeline name is partner-neutral in function (all partners ride it; attribution lives in partner_id + associations). Rename cosmetic, any time.

## 3. Applicant field mapping (portal → HubSpot internal name)

| Portal fact | HubSpot property | Notes |
|---|---|---|
| guarantee_ref | `applicant_id` | **Upsert key** |
| tenant_title | `tenant_title` | Options: Mr; Mrs; Miss; Ms; Dr; Other. **Portal offers Mx — add "Mx" option in HubSpot (one click) before go-live**, else map Mx→Other |
| tenant_first_name | `first_name` | |
| tenant_last_name | `last_name` | |
| full name (derived) | `full_name` | |
| tenant_dob | `dob` | |
| tenant_email | `email` | |
| tenant_phone | `phone_number` | |
| prop_addr1 | `property_address_line_1` | |
| prop_addr2 | `property_address_line_2` | |
| city | `citytown` | |
| county | `county` | |
| postcode | `postcode` | |
| monthly_rent | `monthly_rent` | |
| tenancy_start | `tenancy_start_date` | |
| sent_at | `referral_received_date` | |
| — pipeline | `hs_pipeline` = `3897733314` | Constant |
| status (mapped) | `hs_pipeline_stage` | See §4 |
| payment_state | `payment_status` | Options: Pending; Paid; Refunded — exact match to portal states |
| channel (constant) | `channel` = `Partner Referral` | Owner-ruled |
| fee amount | `fee_paid` | On payment event |
| Stripe payment intent | `stripe_payment_id` | |
| checkout URL | `payment_link_url` | |
| PandaDoc doc id | `pandadoc_document_id` | |
| deed download link | `deed_download_url` *(create: single-line text)* | The portal's secure deed link, written on deed issue — one click from the Applicant card to the executed deed. Owner-ruled: link over integration; the portal stays the deed archive |
| deed issue date | `guarantee_issued` | Feeds the `guarantee_expiry` calculation — never write expiry directly |
| delivery timestamp | `delivered_at` | From the deed-delivery event |
| delivery recipient | `delivered_to` | The claim-contact email actually sent to |
| snapshotted agent rate | `applicant_commission_rate` | **The application's snapshotted rate, never the current partner rate** — feeds the `commission_owed` calculation |
| partner identifier | `partner_id` | Copied from the partner's company record (resolved once per partner at config time) |
| branch/agency reference | `agency_reference_number` | The associated company's crm_company_key |
| joint tenancy | `tenant_role` = `Tenant` | Portal has no joint-tenant concept; constant default |

## 4. Event → sync action

| Portal event | Action |
|---|---|
| Referral created | Upsert Applicant (all §3 identity/property/tenancy fields) · stage → **Referred** · payment_status → Pending · associations (§7) |
| Fee paid | stage → **Fee Paid** · payment_status → Paid · fee_paid, stripe_payment_id |
| Deed issued (executed) | stage → **Deed Issued** · guarantee_issued, pandadoc_document_id |
| Deed delivered to agent | delivered_at, delivered_to (no stage change) |
| Refund | **payment_status → Refunded only. Stage does not move** — lifecycle truth is preserved (a refunded applicant stays at Fee Paid or Deed Issued; the money story lives in payment_status). The legacy pipeline's old "Refunded" stage is historical-only |
| Withdrawn | stage → **Withdrawn** (terminal) |
| Tenancy amend | tenancy_start_date updated (expiry recalculates itself) |

## 5. Never-touch fields (HubSpot-owned; the sync must not write)

- `commission_owed`, `guarantee_expiry` — **Calculations.** Feed their inputs (fee_paid, rate, guarantee_issued/tenancy_start); HubSpot derives.
- `attribution_status` (OK / Review) — Balal's attribution machinery.
- `commission_paid` (Yes / No) — finance's settlement marking.
- `hubspot_owner_id` and all owner/team fields, lifecycle stages on Companies, outreach segments — HubSpot-curated. The sync upserts only its own columns (§3, §6) and never tramples pipeline/outreach work.

## 6. Company sync

**Key convention — namespaced, matching the existing book's house style:**
- Imported branch-directory companies: `IND:{source id}` (e.g. `IND:77651`)
- Main-platform companies: `OD-AGC-{sequence}` (e.g. `OD-AGC-000092`) — **the portal must never mint into this sequence**
- **Portal-born entities: `RFL:{first 8 of the portal UUID}`** (e.g. `RFL:3f9a2b1c`). Distinct namespace = collisions impossible; UUID-derived = stable across re-syncs, no shared counter.

**Single-office rule (owner-ruled):** a single-office agency (portal: agency + its auto "[Agency], Head office" branch) syncs as **ONE company** — agency-level, `head_office_` = Yes, key on the agency UUID; the auto-branch maps to the same company. If a second branch is later added, the sync **promotes**: creates child companies for all branches (including the original Head office), parent-child linked, per-branch keys minted.

**Multi-branch agencies:** agency = parent company, branches = child companies (`company_level` = Branch), parent-child associated.

**Properties the sync owns on portal-minted companies:** `crm_company_key`, `agency_name` / `branch_name`, `company_level`, `head_office_`, `network_group` (← the portal's Group/network field → the parent-company layer), `partner_id`, address fields where held. Everything else (partner_status, owner, segments, ratings) is HubSpot-side.

**Existing-book matching (v1 position):** portal-born agencies create NEW companies under RFL: keys. Where an imported IND: company represents the same real-world agency, that is a **human-driven HubSpot merge** (HubSpot's merge preserves both keys via merged-record IDs) — an operational task, not v1 sync logic. Matches the portal's own "merging comes in a later release" stance. Later enhancement: name+postcode fuzzy matching to *suggest* merges.

## 7. Associations (the attribution chain) — owner ruling: two edges

Every Applicant associates to exactly **two** companies:
1. **The partner's company record** (Rightmove / Zoopla / …) — always, and the **PRIMARY** association (the one Workflow E reads).
2. **The referring agent's branch company** — for a multi-branch group the applicant links to the specific **branch child** (e.g. the Croydon branch under LRG), **not** the group parent; for a single-office agency the single company plays the branch role.

There is **no direct applicant→parent edge**. Agency/group-level rollups traverse the **branch → parent** company link (§6). Rollups still work at every altitude: partner-level (channel totals, via the primary edge), branch-level (the branch edge), agency/group-level (branch → parent). This is exactly two edges — which also fits inside HubSpot's per-record association cap with no config change, so it is the design, not a degradation.

**Balal, one API call at build:** `GET /crm/v4/associations/2-203764825/companies/labels` → the applicant→company association type IDs (partner/primary + branch), and which is flagged primary. (The only IDs not hard-coded in this spec.)

## 8. PII position (embedded ruling — owner may veto)

**Tenants never become Contacts.** Tenant facts live on the Applicant record only (§3). Keeps GDPR surface minimal and the telesales/outreach Contact base uncontaminated. The DPA with Rightmove governs the tenant-data flow into the portal; this spec governs it no further than the Applicant object.

## 9. Backfill position (embedded ruling — owner may veto)

**Start clean at go-live.** There is no historical real book — every current portal application is test debris that dies in the demo teardown, and the HubSpot company book already exists independently (the 10,700 import). The sync's first record is the trial's first real referral.

## 10. Open items (three, all small)

1. **Add "Mx" to `tenant_title`'s options** (one click in HubSpot) — or the sync maps Mx→Other.
2. **Association type IDs** — Balal's one API call (§7).
3. **Rename the pipeline** to something partner-neutral when a second partner goes live (cosmetic, optional).

## 11. Build shape

One edge function (or scheduled worker) consuming the portal's activity events since last cursor → translate via the config mapping table → HubSpot batch upsert APIs (Applicants, Companies, associations) → cursor advance. Failures alert via the ops-alerting channel (built 5 Jul). Config table seeded from §3's mapping. Estimated effort: 2–3 days including tests, against this spec.
