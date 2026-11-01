import { db, logStep } from "./db";

// Hands a finished scan to the n8n automation (spec section 5). n8n saves the matches,
// adds deadlines to a calendar, emails the digest, and posts its steps back to
// /api/automation-log so they appear in the activity log.
export async function sendToAutomation(scanId: string) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    await logStep(scanId, "Automation", "n8n isn't connected yet (N8N_WEBHOOK_URL is not set), so no email or calendar events");
    return;
  }

  const { data: scan } = await db.from("scans").select("org_id,sources_checked").eq("id", scanId).single();
  if (!scan) return;
  const [{ data: org }, { data: apply }] = await Promise.all([
    db.from("orgs").select("name,funding_contacts").eq("id", scan.org_id).single(),
    db.from("opportunities").select("id,title,provider,amount,deadline,url").eq("scan_id", scanId).eq("verdict", "apply").order("fit_score", { ascending: false }),
  ]);
  const site = process.env.URL ?? "https://fundscout-cu.netlify.app"; // Netlify sets URL to the live site

  const payload = {
    scan_id: scanId,
    org_name: org?.name,
    funding_contacts: org?.funding_contacts ?? [],
    apply_opportunities: (apply ?? []).map((o) => ({
      title: o.title,
      provider: o.provider,
      amount: o.amount,
      deadline: o.deadline,
      url: o.url,
      app_link: `${site}/#/opportunity/${o.id}`,
    })),
    sources_checked: scan.sources_checked,
    log_url: `${site}/api/automation-log`,
  };

  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`n8n returned ${res.status}`);
    await logStep(scanId, "Automation", `Sent ${payload.apply_opportunities.length} Apply matches to the n8n automation`);
  } catch (err) {
    await logStep(scanId, "Automation", `Couldn't reach the n8n automation: ${(err as Error).message}`);
  }
}
