// =====================================================================
// PandaDoc (sandbox) helpers. API key, template id and webhook shared key are
// Edge Function secrets. Sandbox/test only: every recipient is routed to
// EMAIL_REVIEW_ADDRESS so no real tenant is emailed.
//
// The tenant is the only live signer. The opndoor signature is a facsimile
// image placed as static content in the template. Issue Date is a PandaDoc
// date-signed field bound to the tenant's signature, so it is NOT a merge
// token; five tokens are merged from the application record.
// =====================================================================
const API = "https://api.pandadoc.com/public/v1";
const KEY = Deno.env.get("PANDADOC_API_KEY") ?? "";
const TEMPLATE_ID = Deno.env.get("PANDADOC_TEMPLATE_ID") ?? "";
const WEBHOOK_KEY = Deno.env.get("PANDADOC_WEBHOOK_SHARED_KEY") ?? "";
const REVIEW = Deno.env.get("EMAIL_REVIEW_ADDRESS") ?? "";

export function pandadocConfigured(): boolean {
  return Boolean(KEY && TEMPLATE_ID);
}

function headers(): Record<string, string> {
  return { Authorization: `API-Key ${KEY}`, "Content-Type": "application/json" };
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "");
}

export interface DeedApp {
  id: string;
  guarantee_ref: string;
  tenant_first_name: string;
  tenant_last_name: string;
  tenant_email: string;
  tenancy_start: string;
  prop_addr1: string;
  prop_addr2: string | null;
  prop_city: string;
  prop_postcode: string;
  agent_email: string;
}

// The five merge tokens. The docx must define these token names (the naming is
// the contract that keeps the template swappable with no code change).
function tokens(a: DeedApp) {
  const address = [a.prop_addr1, a.prop_addr2, a.prop_city, a.prop_postcode].filter(Boolean).join(", ");
  return [
    { name: "reference_number", value: a.guarantee_ref },
    { name: "tenant_name", value: `${a.tenant_first_name} ${a.tenant_last_name}` },
    { name: "tenancy_start_date", value: fmtDate(a.tenancy_start) },
    { name: "rental_address", value: address },
    { name: "agent_email", value: a.agent_email },
  ];
}

export interface DeedResult {
  ok: boolean;
  documentId?: string;
  error?: string;
}

/** Create the deed document from the template and send it to the tenant to sign. */
export async function createAndSend(a: DeedApp): Promise<DeedResult> {
  if (!pandadocConfigured()) return { ok: false, error: "PandaDoc is not configured (PANDADOC_API_KEY / PANDADOC_TEMPLATE_ID)." };
  try {
    const createRes = await fetch(`${API}/documents`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: `Deed of Guarantee - ${a.guarantee_ref}`,
        template_uuid: TEMPLATE_ID,
        // Sandbox: route the tenant recipient to the review address.
        recipients: [{ email: REVIEW || a.tenant_email, first_name: a.tenant_first_name, last_name: a.tenant_last_name, role: "Tenant" }],
        tokens: tokens(a),
        metadata: { application_id: a.id, guarantee_ref: a.guarantee_ref },
      }),
    });
    if (!createRes.ok) return { ok: false, error: `PandaDoc create ${createRes.status}: ${(await createRes.text()).slice(0, 300)}` };
    const created = await createRes.json();
    const docId = created.id as string;

    // The document processes asynchronously to "document.draft" before it can be sent.
    for (let i = 0; i < 8; i++) {
      const st = await fetch(`${API}/documents/${docId}`, { headers: headers() });
      const doc = await st.json();
      if (doc.status === "document.draft") break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    const sendRes = await fetch(`${API}/documents/${docId}/send`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ silent: false, subject: `Please sign your Deed of Guarantee - ${a.guarantee_ref}`, message: "Please review and sign your Deed of Guarantee." }),
    });
    if (!sendRes.ok) return { ok: false, documentId: docId, error: `PandaDoc send ${sendRes.status}: ${(await sendRes.text()).slice(0, 300)}` };
    return { ok: true, documentId: docId };
  } catch (e) {
    return { ok: false, error: `PandaDoc request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Re-send the signature request for an existing document. */
export async function resendDocument(documentId: string): Promise<DeedResult> {
  if (!pandadocConfigured()) return { ok: false, error: "PandaDoc is not configured." };
  try {
    const res = await fetch(`${API}/documents/${documentId}/send`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ silent: false, message: "Reminder: please sign your Deed of Guarantee." }),
    });
    if (!res.ok) return { ok: false, error: `PandaDoc resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, documentId };
  } catch (e) {
    return { ok: false, error: `PandaDoc resend failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Download the executed PDF (available once the document is completed). */
export async function downloadPdf(documentId: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${API}/documents/${documentId}/download`, { headers: { Authorization: `API-Key ${KEY}` } });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** PandaDoc signs webhooks with HMAC-SHA256 of the raw body using the shared key. */
export async function verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_KEY || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === signature.toLowerCase();
}

/**
 * Generate and send the deed for an application (agent email resolved server
 * side; generation is blocked with a clear error if there is no agent contact).
 * Used on the Paid transition and by the manual retry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateDeed(service: any, appId: string): Promise<DeedResult> {
  const { data: app } = await service
    .from("applications")
    .select("id, guarantee_ref, tenant_first_name, tenant_last_name, tenant_email, tenancy_start, prop_addr1, prop_addr2, prop_city, prop_postcode, branch_id")
    .eq("id", appId)
    .maybeSingle();
  if (!app) return { ok: false, error: "Application not found." };

  const { data: contact } = await service.rpc("effective_primary_contact", { p_branch: app.branch_id });
  const c = Array.isArray(contact) ? contact[0] : contact;
  const agentEmail = c?.email ?? null;
  if (!agentEmail) {
    await service.from("applications").update({ deed_state: "error" }).eq("id", appId);
    await service.from("activity_log").insert({ application_id: appId, kind: "deed_error", message: "Deed not generated: add an agent contact for this branch, then retry.", actor: "System" });
    return { ok: false, error: "No agent contact for this branch. Add one, then retry." };
  }

  const res = await createAndSend({ ...app, agent_email: agentEmail });
  if (!res.ok) {
    await service.from("applications").update({ deed_state: "error" }).eq("id", appId);
    await service.from("activity_log").insert({ application_id: appId, kind: "deed_error", message: `Deed generation failed: ${res.error}`, actor: "System" });
    return res;
  }
  await service.from("applications").update({ pandadoc_document_id: res.documentId, deed_state: "awaiting_tenant", deed_sent_at: new Date().toISOString() }).eq("id", appId);
  await service.from("activity_log").insert({ application_id: appId, kind: "deed_sent", message: "Deed of Guarantee sent to the tenant for signature.", actor: "System" });
  return res;
}
