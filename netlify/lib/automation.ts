import { createHmac, timingSafeEqual } from "node:crypto";
import { db, logStep } from "./db";
import { isHttpUrl } from "./http";

export const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

// The token n8n must send back to write to one scan's activity log. It is derived from
// AUTOMATION_LOG_SECRET, so it only works for that scan and can't be guessed.
export function logToken(scanId: string): string | null {
  const secret = process.env.AUTOMATION_LOG_SECRET;
  return secret ? createHmac("sha256", secret).update(scanId).digest("hex") : null;
}

export function validLogToken(scanId: string, token: string | null): boolean {
  const expected = logToken(scanId);
  if (!expected || !token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// Hands a finished scan to the n8n automation (spec section 5). n8n adds deadlines to a
// calendar, emails the digest, and posts its steps back to /api/automation-log so they
// appear in the activity log.
export async function sendToAutomation(scanId: string) {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const token = logToken(scanId);
  if (!url || !secret || !token) {
    await logStep(scanId, "Automation", "The n8n automation isn't set up yet, so no email or calendar events");
    return;
  }

  const { data: scan } = await db.from("scans").select("org_id,sources_checked").eq("id", scanId).single();
  if (!scan) return;
  const [{ data: org }, { data: apply }] = await Promise.all([
    db.from("orgs").select("name,funding_contacts").eq("id", scan.org_id).single(),
    db
      .from("opportunities")
      .select("id,title,provider,amount,deadline,deadline_verified,url,reasons")
      .eq("scan_id", scanId)
      .eq("verdict", "apply")
      .order("fit_score", { ascending: false }),
  ]);

  // The digest only goes to the addresses saved on the club's profile (placeholders skipped).
  const to = (org?.funding_contacts ?? []).filter((e: string) => EMAIL.test(e) && !e.endsWith("@example.com"));
  if (!to.length) {
    await logStep(scanId, "Automation", "No digest email is saved on the profile, so no digest was sent. Add one under Edit profile.");
    return;
  }
  const site = process.env.URL ?? "https://fundscout-cu.netlify.app"; // Netlify sets URL to the live site

  const payload = {
    scan_id: scanId,
    log_token: token,
    org_name: org?.name,
    funding_contacts: to,
    apply_opportunities: (apply ?? [])
      .filter((o) => isHttpUrl(o.url))
      .map((o) => ({
        title: o.title,
        provider: o.provider,
        amount: o.amount,
        deadline: o.deadline,
        deadline_verified: o.deadline_verified,
        reason: (o.reasons ?? "").slice(0, 300),
        url: o.url,
        app_link: `${site}/#/opportunity/${o.id}`,
      })),
    sources_checked: scan.sources_checked,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-FundScout-Secret": secret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`n8n returned ${res.status}`);
    await db.from("scans").update({ digest_sent_at: new Date().toISOString() }).eq("id", scanId);
    await logStep(scanId, "Automation", `Sent ${payload.apply_opportunities.length} Apply matches to the n8n automation`);
  } catch (err) {
    console.error("n8n hand-off failed:", (err as Error).message);
    await logStep(scanId, "Automation", "Couldn't reach the n8n automation");
  }
}
