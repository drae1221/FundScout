import { db, logStep, type Org } from "./db";
import { fitCheck } from "./fit";
import type { Candidate } from "./scout";

// Runs the Fit agent again on one opportunity, using the club's latest profile and
// confirmed facts, and saves the new verdict on the same card.
export async function recheck(opportunityId: string) {
  const { data: opp, error } = await db.from("opportunities").select("*").eq("id", opportunityId).single();
  if (error) throw new Error(`Opportunity not found: ${error.message}`);
  const log = (message: string) => logStep(opp.scan_id, "Fit", message);
  const before = `${opp.verdict.toUpperCase()} (${opp.fit_score})`;

  try {
    const { data: org, error: orgError } = await db.from("orgs").select("*").eq("id", opp.org_id).single<Org>();
    if (orgError) throw new Error(orgError.message);
    await log(`Re-checking "${opp.title}" with the club's confirmed facts`);
    const candidate: Candidate = {
      title: opp.title,
      provider: opp.provider ?? "",
      url: opp.url,
      source: opp.source,
      library_id: opp.library_id,
      audience: opp.audience,
      amount: opp.amount,
      why: `Earlier verdict: ${before}. ${opp.reasons}`,
    };
    const v = await fitCheck(org, candidate, opp.scan_id);
    const { error: saveError } = await db
      .from("opportunities")
      .update({
        verdict: v.verdict,
        fit_score: v.fit_score,
        reasons: v.reasons,
        eligibility_flags: v.eligibility_flags,
        deadline: v.deadline ?? opp.deadline,
        amount: v.amount ?? opp.amount,
      })
      .eq("id", opp.id);
    if (saveError) throw new Error(saveError.message);
    await log(`Re-checked "${opp.title}": ${before} → ${v.verdict.toUpperCase()} (${v.fit_score})`);
  } catch (err) {
    await log(`Couldn't re-check "${opp.title}": ${(err as Error).message}`);
  }
}
