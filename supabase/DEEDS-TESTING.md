# Deed of Guarantee (PandaDoc sandbox) - setup and test runbook

Strictly sandbox/test. The Edge Functions only act when `PANDADOC_API_KEY` and
`PANDADOC_TEMPLATE_ID` are set, and every recipient is redirected to
`EMAIL_REVIEW_ADDRESS`, so no real tenant is ever emailed. Do not point this at a
production PandaDoc workspace or a live API key.

Flow: when Stripe flips an application to **Paid**, the `stripe-webhook`
generates the Deed of Guarantee from the PandaDoc template (five merge tokens),
and sends it to the tenant to e-sign. The application stays **Paid** with a
visible deed sub-state (`awaiting_tenant`). When the tenant signs, PandaDoc fires
`document.completed`; the `pandadoc-webhook` (signature-verified, idempotent,
service role) downloads the executed PDF, stores it privately, and flips
**Paid -> Deed Issued**. Download deed serves that PDF via a short-lived signed
URL.

The tenant is the **only** live signer. The opndoor director's signature is a
facsimile image placed as static content in the template under standing
authority; there are no director recipients. The **Issue Date** is a PandaDoc
date-signed field bound to the tenant's signature, so the deed is dated on
execution (it is not a merge token).

## 1. Environment values and where they go

**Client (`opndoor-portal/.env.local`), optional badge only:**
```
VITE_PANDADOC_SANDBOX=true
```
Restart the dev server after setting it. This only shows the "Sandbox" badge on
the deed card; it carries no secret.

**Edge Function secrets (server side, never in the repo).** Set in the Supabase
dashboard: Project > Edge Functions > Secrets. Add:

| Secret | Value | Notes |
|---|---|---|
| `PANDADOC_API_KEY` | sandbox `API-Key` | From the PandaDoc **sandbox** workspace (Settings > API). Sandbox key only. |
| `PANDADOC_TEMPLATE_ID` | template uuid | The Deed of Guarantee template (step 3). Swapping templates is config-only, no code change, as long as the token names and Tenant role match. |
| `PANDADOC_WEBHOOK_SHARED_KEY` | shared secret | The shared key you set on the PandaDoc webhook (step 4). Verifies the signature. |
| `EMAIL_REVIEW_ADDRESS` | mdwyer@opndoor.co | TEST SAFETY: every deed recipient is redirected here. Shared with the payments runbook. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically; do not set them. Secrets take effect on the next function call, no
redeploy needed.

## 2. What must exist in Supabase (already applied)

- `applications`: `pandadoc_document_id`, `deed_state`
  (`awaiting_tenant | executed | declined | voided | error`), `deed_sent_at`,
  `deed_executed_at`, `executed_pdf_path`.
- `pandadoc_events` (id PK) for webhook idempotency, RLS on.
- Private storage bucket `deeds` (not public).
- Service-role RPCs `apply_deed_executed` (idempotent Paid -> Deed Issued) and
  `set_deed_state`, revoked from public/anon/authenticated.
- Functions deployed: `pandadoc-webhook` (JWT off), `pandadoc-resend` (JWT on),
  `deed-download` (JWT on), plus the `stripe-webhook` change that calls
  `generateDeed` on the Paid transition.

## 3. Build the template in the PandaDoc sandbox

1. Switch to the **sandbox** workspace (top-left workspace switcher; sandbox is
   free and clearly labelled). Everything below is done in sandbox.
2. Templates > New > upload the Deed of Guarantee `.docx`.
3. Add **one** signer role named exactly `Tenant`.
4. Place fields for the Tenant role on the signature block:
   - a **Signature** field, and
   - a **Date signed** field (this becomes the Issue Date; do not use a merge
     token for the date).
5. Leave the opndoor signature as the **static facsimile image** already in the
   document at "Signed for and on behalf of the Guarantor". Do not add a second
   signer role for it.
6. Define these five **merge tokens** (Manage > Tokens, names exact):
   `reference_number`, `tenant_name`, `tenancy_start_date`, `rental_address`,
   `agent_email`. The names are the contract that keeps the template swappable.
7. Save, then copy the template id from the URL (or Template > ... > Details) and
   set it as `PANDADOC_TEMPLATE_ID`.

> The token names and the `Tenant` role name are the only coupling between the
> template and the code. Keep them exact and you can restyle or re-upload the
> deed without touching the functions.

## 4. Point the PandaDoc webhook at the function

Function URL:
`https://pwftaqtrrqtilxlvwxjd.supabase.co/functions/v1/pandadoc-webhook`

1. PandaDoc sandbox > Settings > Integrations > Webhooks (or Developers >
   Webhooks) > Create.
2. **Endpoint URL:** paste the function URL. The function reads the signature
   from a `signature` query parameter, which PandaDoc appends automatically; you
   do not add it yourself.
3. **Shared key:** set a strong shared secret and copy the same value into the
   `PANDADOC_WEBHOOK_SHARED_KEY` secret. This is what the function HMAC-verifies.
4. **Events:** subscribe to document state change events, at minimum
   `document_state_changed` (covers completed / voided / declined). The function
   keys off `data.status` = `document.completed` / `document.voided` /
   `document.declined`.
5. Enable PandaDoc's **automatic signer reminders** on the workspace/template so
   unsigned deeds are chased without manual action; the app's manual "Resend
   signature request" is on top of that, not instead of it.

## 5. End-to-end test

Make sure the dev server is running (`npm run dev`), you are signed in, and both
the payments and deeds env above are set.

1. **Reach Paid.** Follow the payments runbook to take a referral to **Paid**
   (`4242 4242 4242 4242`). On the Paid flip the deed generates automatically.
2. **Awaiting signature.** The detail page's Guarantee deed card shows a
   "Sandbox" badge and "Deed sent for signature, awaiting tenant" with the sent
   date and a **Resend signature request** button. The activity feed shows "Deed
   of Guarantee sent to the tenant for signature". Your `EMAIL_REVIEW_ADDRESS`
   inbox receives the PandaDoc signing email (redirected from the tenant).
3. **Sign.** Open the signing link, complete the Signature and Date signed
   fields, finish. PandaDoc fires `document.completed`.
4. **Deed Issued.** The detail page flips **Paid -> Deed Issued**; the deed card
   shows the deed file and **Download deed** opens the executed PDF via a signed
   URL. Issue and expiry dates are populated; the activity feed shows "Deed of
   Guarantee fully executed and issued".
5. **No agent contact (blocked with a clear error).** For a branch with no agent
   contact, generation sets `deed_state = error` and logs "add an agent contact
   for this branch, then retry". The deed card shows the warning and a **Generate
   deed** button; add a contact, click it, and it regenerates.
6. **Decline / void (review, no reversal).** Decline or void the document in
   PandaDoc. The deed card shows the review warning with a **Generate deed**
   button; the status stays Paid. Activity logs the decline/void.
7. **Duplicate webhook (idempotent).** Re-deliver a `document.completed` event
   from PandaDoc. No second transition and no duplicate PDF (the
   `docId:status` key is deduplicated in `pandadoc_events`, and
   `apply_deed_executed` only fires while Paid).
8. **Ageing chase.** An `awaiting_tenant` deed whose `deed_sent_at` is more than
   7 days ago appears on the Activity page under "Awaiting tenant signature",
   longest-waiting first, alongside upcoming expiries.

## 6. Inspect state directly (optional)

```sql
select guarantee_ref, status, deed_state, deed_sent_at, deed_executed_at,
       pandadoc_document_id, executed_pdf_path
from public.applications
where guarantee_ref = 'GR-XXXXX';

select id, type, application_id, received_at
from public.pandadoc_events
order by received_at desc
limit 20;
```

## Notes

- `pandadoc-webhook` has JWT verification off and is secured by the PandaDoc HMAC
  signature instead; `pandadoc-resend` and `deed-download` require a signed-in
  (JWT) caller and are scoped by RLS to whoever can already see the application
  (owning Referrer, Management, admin).
- `apply_deed_executed` / `set_deed_state` are service-role only (the webhook's
  transition path), the deed twins of `apply_stripe_payment`.
- All source lives in `opndoor-portal/supabase/functions/`. Redeploy after edits
  with `npx supabase functions deploy <name> --project-ref pwftaqtrrqtilxlvwxjd`
  (`pandadoc-webhook` needs `--no-verify-jwt`).
