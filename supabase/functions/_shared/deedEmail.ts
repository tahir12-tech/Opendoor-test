// =====================================================================
// Deed-to-agent delivery, shared by the automatic path (pandadoc-webhook, on
// execution) and the manual path (send-deed-to-agent). Sends the branded deed
// email to the resolved claim contact with a short-lived signed download link,
// and writes the activity log. In this test build every message is redirected to
// EMAIL_REVIEW_ADDRESS; the business activity entry names the intended recipient
// and the test-mode redirect is a separate opndoor-admin-only internal entry.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "opndoor <payments@opndoor.co>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "hello@opndoor.co";
const REVIEW_ADDRESS = Deno.env.get("EMAIL_REVIEW_ADDRESS");

interface SendResult { ok: boolean; error?: string; to?: string }

async function sendEmail(opts: { subject: string; html: string }): Promise<SendResult> {
  if (!RESEND_API_KEY) return { ok: false, error: "Resend is not configured (RESEND_API_KEY not set)." };
  if (!REVIEW_ADDRESS) return { ok: false, error: "Test review address (EMAIL_REVIEW_ADDRESS) is not set." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [REVIEW_ADDRESS], reply_to: REPLY_TO, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `Resend responded ${res.status}: ${detail.slice(0, 200)}`, to: REVIEW_ADDRESS };
    }
    return { ok: true, to: REVIEW_ADDRESS };
  } catch (e) {
    return { ok: false, error: `Resend request failed: ${e instanceof Error ? e.message : String(e)}`, to: REVIEW_ADDRESS };
  }
}

const VALHALLA = "#271d5f";
const HELIOTROPE = "#d364fb";
const HELIOTROPE_DEEP = "#b54de0";
const INK_SOFT = "#5b4d86";
const LILAC = "#f8eff9";

function layout(inner: string, intendedFor: string): string {
  const banner = `<tr><td style="padding:10px 16px;background:${LILAC};border-bottom:1px solid rgba(39,29,95,0.1);font:600 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${INK_SOFT};">Test mode. This email was intended for ${intendedFor} and redirected to you for review.</td></tr>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f3fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3fa;padding:28px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px -18px rgba(39,29,95,0.4);">
        <tr><td style="background:${VALHALLA};padding:22px 28px;">
          <span style="font:800 22px -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:-0.02em;color:#ffffff;">opndoor</span>
          <span style="font:600 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:rgba(255,255,255,0.7);margin-left:10px;">Guarantee Referral Portal</span>
        </td></tr>
        ${banner}
        <tr><td style="padding:28px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${VALHALLA};">${inner}</td></tr>
        <tr><td style="padding:18px 28px;background:${LILAC};font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${INK_SOFT};">opndoor. Questions? Reply to this email or contact ${REPLY_TO}.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function deedAgentTemplate(p: { agentName: string; tenantName: string; propertyAddr: string; guaranteeRef: string; downloadUrl: string; intendedFor: string }): { subject: string; html: string } {
  const subject = `Deed of Guarantee issued - ${p.guaranteeRef}`;
  const greet = p.agentName ? `Dear ${p.agentName},` : "Hello,";
  const button = p.downloadUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 8px;"><tr><td>
        <a href="${p.downloadUrl}" style="display:inline-block;background:${HELIOTROPE};background-image:linear-gradient(135deg,${HELIOTROPE},${HELIOTROPE_DEEP});color:#ffffff;text-decoration:none;font:700 15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:13px 26px;border-radius:10px;">Download the Deed of Guarantee</a>
      </td></tr></table>
      <p style="margin:8px 0 0;font-size:12px;color:${INK_SOFT};">This secure download link expires in a few days; contact opndoor if you need it re-sent.</p>`
    : `<p style="margin:0;font-size:13px;color:${INK_SOFT};">The signed deed is on file with opndoor. Contact us to receive a copy.</p>`;
  const inner = `
    <p style="margin:0 0 14px;">${greet}</p>
    <p style="margin:0 0 14px;">The Deed of Guarantee for <b>${p.tenantName}</b> at ${p.propertyAddr} has been signed and issued. opndoor is now the professional guarantor for this tenancy.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid rgba(39,29,95,0.12);border-radius:12px;"><tr><td style="padding:14px 18px;">
      <div style="font:600 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:0.12em;text-transform:uppercase;color:${INK_SOFT};">Guarantee reference</div>
      <div style="font:800 20px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${VALHALLA};margin-top:2px;">${p.guaranteeRef}</div>
    </td></tr></table>
    ${button}`;
  return { subject, html: layout(inner, p.intendedFor) };
}

export interface DeedTarget {
  appId: string;
  ref: string;
  tenantName: string;
  propertyAddr: string;
  pdfPath: string | null;
}
export interface DeedRecipient { email: string; name: string }

/**
 * Deliver the issued deed to the resolved claim contact: mint a signed download
 * link, email it (redirected to the review address in test mode), and write the
 * partner-safe "Deed sent to <email> · <mode>" activity entry plus an admin-only
 * internal entry for the test-mode redirect. Returns the send outcome.
 */
export async function deliverDeedToAgent(service: any, target: DeedTarget, recipient: DeedRecipient, mode: string): Promise<SendResult> {
  let downloadUrl = "";
  if (target.pdfPath) {
    const { data: signed } = await service.storage.from("deeds").createSignedUrl(target.pdfPath, 604800); // 7 days
    downloadUrl = signed?.signedUrl ?? "";
  }
  const tpl = deedAgentTemplate({
    agentName: recipient.name,
    tenantName: target.tenantName,
    propertyAddr: target.propertyAddr,
    guaranteeRef: target.ref,
    downloadUrl,
    intendedFor: recipient.email,
  });
  const res = await sendEmail({ subject: tpl.subject, html: tpl.html });

  // Partner-safe business entry names the intended agent contact; the test-mode
  // redirect target stays admin-only (a separate internal entry).
  await service.from("activity_log").insert({
    application_id: target.appId,
    kind: res.ok ? "deed_delivered" : "deed_delivery_failed",
    message: res.ok ? `Deed sent to ${recipient.email} · ${mode}` : `Deed email to the agent could not be sent: ${res.error}`,
    actor: "System",
    visibility: res.ok ? "business" : "internal",
  });
  if (res.ok && res.to && res.to !== recipient.email) {
    await service.from("activity_log").insert({
      application_id: target.appId,
      kind: "deed_delivered",
      message: `Redirected to ${res.to} (test mode).`,
      actor: "System",
      visibility: "internal",
    });
  }
  return { ...res, to: recipient.email };
}
