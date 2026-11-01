import { db, logStep, type Org } from "./db";
import { scout } from "./scout";
import { fitCheck } from "./fit";
import { sendToAutomation } from "./automation";

const FIT_CONCURRENCY = 4; // Fit agents running at once

// One full scan: Scout finds candidates, then a Fit agent judges each one.
// Results are saved as they arrive so the dashboard fills in live.
// weekly = the scheduled/"Run weekly scan now" scan, which also hands results to n8n.
export async function runScan(orgId: string, scanId: string, weekly = false) {
  const { error: scanError } = await db.from("scans").insert({ id: scanId, org_id: orgId, status: "running" });
  if (scanError) throw new Error(scanError.message);

  try {
    const { data: org, error } = await db.from("orgs").select("*").eq("id", orgId).single<Org>();
    if (error) throw new Error(`Org not found: ${error.message}`);
    await logStep(scanId, "Scan", `Started a funding scan for ${org.name}`);

    const { candidates, sourcesChecked } = await scout(org, scanId);
    const counts = { apply: 0, maybe: 0, skip: 0, members: 0, failed: 0 };

    const queue = [...candidates];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          const v = await fitCheck(org, c, scanId);
          const { error: insertError } = await db.from("opportunities").insert({
            org_id: org.id,
            scan_id: scanId,
            source: c.source,
            library_id: c.library_id,
            audience: c.audience,
            title: c.title,
            provider: c.provider,
            url: c.url,
            amount: v.amount ?? c.amount,
            deadline: v.deadline,
            verdict: v.verdict,
            fit_score: v.fit_score,
            reasons: v.reasons,
            eligibility_flags: v.eligibility_flags,
          });
          if (insertError) throw new Error(insertError.message);
          counts[v.verdict]++;
          if (c.audience === "members") counts.members++;
          await logStep(scanId, "Fit", `${v.verdict.toUpperCase()} (${v.fit_score}): ${c.title}`);
        } catch (err) {
          counts.failed++;
          await logStep(scanId, "Fit", `Couldn't evaluate "${c.title}": ${(err as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: FIT_CONCURRENCY }, worker));

    await db
      .from("scans")
      .update({ status: "done", finished_at: new Date().toISOString(), sources_checked: sourcesChecked, counts })
      .eq("id", scanId);
    await logStep(scanId, "Scan", `Done: ${counts.apply} apply, ${counts.maybe} maybe, ${counts.skip} skip`);
    if (weekly) await sendToAutomation(scanId);
  } catch (err) {
    const message = (err as Error).message;
    await db.from("scans").update({ status: "failed", finished_at: new Date().toISOString(), error: message }).eq("id", scanId);
    await logStep(scanId, "Scan", `Scan failed: ${message}`);
  }
}
