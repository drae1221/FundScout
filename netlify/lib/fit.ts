import type Anthropic from "@anthropic-ai/sdk";
import { logStep, type Org } from "./db";
import { runAgent } from "./claude";
import { describeOrg, type Candidate } from "./scout";
import { readPage, untrusted, UNTRUSTED_RULES } from "./pages";

export interface Verdict {
  verdict: "apply" | "maybe" | "skip";
  fit_score: number;
  reasons: string;
  eligibility_flags: string[];
  deadline: string | null;
  amount: string | null;
}

const SYSTEM = `You are the Fit & Eligibility agent in FundScout. You decide whether one funding opportunity is worth pursuing, then submit your decision with the submit_verdict tool.

Steps:
1. Read the official details. For Grants.gov opportunities, call fetch_grants_gov_details (their web pages don't load). For everything else, call fetch_opportunity_details to read the opportunity's page. If the details are unavailable or unclear, decide only from what you have, say what you couldn't check, and lean toward "maybe".
2. Check hard eligibility against the organization profile: registered student organization required? 501(c)(3) required? Geography (school, city, state, country)? Cost-share or matching funds? Field of study? Is the deadline already past?
3. Weigh fit and effort against reward.
4. Choose a verdict:
   - apply: eligible, a good fit, and worth the effort.
   - maybe: possibly eligible or a partial fit, or key facts are unclear.
   - skip: not eligible, expired, or not worth the effort. If it requires a 501(c)(3) and the organization is not one (and has no nonprofit partner), the verdict must be skip, and the reasons must say so.

Opportunities marked "for members" are for individual club members (scholarships, travel awards, competitions). Judge whether typical members of this club would qualify and benefit. "apply" means "worth sharing with members". Do not ask for or assume personal details about any member.

Rules:
- Base every claim on the page, the tool results or the candidate info you were given. Never fill gaps from your own background knowledge of a program.
- Write reasons in plain language for a student club treasurer: 1 to 3 short sentences.
- Never mention tools, tool limits, fetching, or technical errors in reasons or flags. If you couldn't check something, say you couldn't confirm it on the page.
- eligibility_flags are short labels, such as "Requires 501(c)(3)", "CU Boulder RSOs only", "Deadline passed" or "Unclear eligibility".
- deadline: the next date the club must act by, as YYYY-MM-DD, only if the page or tool results state one. For funds decided at hearings or meetings, use the next submission deadline the club can still make; if those have passed, use the last upcoming hearing date the club can still get onto. If you mention a date like that in your reasons, put it here too. Otherwise null. Never guess. (The deadline is always shown as "verify on source".)
- amount: the funding amount as written on the page or in the candidate info, or null.
- fit_score: 0 to 100.
- Profile fields that say "[PLACEHOLDER: ...]" or "unknown" are not known yet. Do not treat them as facts.
- Facts marked "club-confirmed" in the profile were confirmed by a named club officer. Use them to settle eligibility questions they answer, and say so in the reasons (for example "The club confirmed it is affiliated with Arts & Sciences").

${UNTRUSTED_RULES}`;

// Both reading tools take no input: they always read THIS opportunity's own source, so text
// on a page can't send the agent to some other address.
const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "fetch_opportunity_details",
    description: "Read the text of this opportunity's web page (the URL you were given).",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "fetch_grants_gov_details",
    description:
      "Get the official details of this Grants.gov opportunity: who may apply, cost sharing, deadline, award amounts and description.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_verdict",
    description: "Submit your final decision for this opportunity. Call this once.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["apply", "maybe", "skip"] },
        fit_score: { type: "integer" },
        reasons: { type: "string" },
        eligibility_flags: { type: "array", items: { type: "string" } },
        deadline: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
        amount: { type: ["string", "null"] },
      },
      required: ["verdict", "fit_score", "reasons", "eligibility_flags", "deadline", "amount"],
      additionalProperties: false,
    },
  },
];

const stripHtml = (s: string | null | undefined, max = 1500) =>
  (s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export async function fetchGrantsGovDetails(input: { opportunity_id: string }): Promise<string> {
  if (!/^\d+$/.test(input.opportunity_id)) throw new Error("opportunity_id must be numeric");
  const res = await fetch("https://api.grants.gov/v1/api/fetchOpportunity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunityId: Number(input.opportunity_id) }),
  });
  if (!res.ok) throw new Error(`Grants.gov returned ${res.status}`);
  const o = (await res.json()).data ?? {};
  const s = o.synopsis ?? o.forecast ?? {};
  return JSON.stringify({
    title: o.opportunityTitle,
    agency: s.agencyName,
    applicant_types: (s.applicantTypes ?? []).map((a: { description: string }) => a.description),
    who_may_apply: stripHtml(s.applicantEligibilityDesc),
    cost_sharing_required: s.costSharing,
    close_date: s.responseDateStr ?? s.responseDateDesc ?? null,
    award_floor: s.awardFloor ?? null,
    award_ceiling: s.awardCeiling ?? null,
    description: stripHtml(s.synopsisDesc ?? s.forecastDesc),
  });
}

export async function fitCheck(org: Org, c: Candidate, scanId: string): Promise<Verdict> {
  const grantsGovId = c.source === "grants_gov" ? c.url.match(/(\d+)\/?$/)?.[1] : undefined;
  // Titles, amounts and notes came from search results, so they are untrusted too.
  const prompt = `Today is ${new Date().toISOString().slice(0, 10)}.

Organization:
${describeOrg(org)}

Opportunity (${c.audience === "members" ? "for members" : "for the club"}), as found by the Scout:
${untrusted("untrusted_search_result", c.url, `Title: ${c.title}\nProvider: ${c.provider}\nURL: ${c.url}\nAmount (from search): ${c.amount ?? "unknown"}\nScout's note: ${c.why}`)}`;

  const evidence: string[] = []; // raw text the agent read, for the hard rules below
  const v = await runAgent<Verdict>({
    system: SYSTEM,
    prompt,
    tools: TOOLS,
    handlers: {
      fetch_opportunity_details: async () => {
        await logStep(scanId, "Fit", `Reading the page for "${c.title}"`);
        const page = await readPage(c.url);
        evidence.push(page.text);
        return page.wrapped;
      },
      fetch_grants_gov_details: async () => {
        if (!grantsGovId) throw new Error("This isn't a Grants.gov opportunity. Use fetch_opportunity_details.");
        await logStep(scanId, "Fit", `Reading the official Grants.gov listing for "${c.title}"`);
        const details = await fetchGrantsGovDetails({ opportunity_id: grantsGovId });
        evidence.push(details);
        return untrusted("untrusted_page", c.url, details);
      },
    },
    finishTool: "submit_verdict",
    maxToolCalls: 2,
  });

  return enforceRules(org, v, evidence.join("\n"));
}

// ---- Checks in code that the model can't talk its way past ----

const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const REQUIRES_501C3 = /requires?\s+(?:a\s+)?501\s*\(?c\)?\s*\(?3\)?|501\s*\(?c\)?\s*\(?3\)?\s*(?:status\s+)?(?:required|only)/i;
// On the page: "501(c)(3)" near words like "must", "required", "eligible" or "only".
const PAGE_501C3 = /(?:must|required|requirement|eligib\w*|only|limited to)[^.\n]{0,120}501\s*\(?c\)?\s*\(?3\)?|501\s*\(?c\)?\s*\(?3\)?[^.\n]{0,60}(?:required|only|must)/i;

export function enforceRules(org: Org, v: Verdict, pageText: string): Verdict {
  const out: Verdict = {
    verdict: ["apply", "maybe", "skip"].includes(v.verdict) ? v.verdict : "maybe",
    fit_score: Number.isFinite(Number(v.fit_score)) ? Math.max(0, Math.min(100, Math.round(Number(v.fit_score)))) : 0,
    reasons: clean(v.reasons, 600),
    eligibility_flags: (Array.isArray(v.eligibility_flags) ? v.eligibility_flags : []).map((f) => clean(f, 80)).filter(Boolean).slice(0, 8),
    deadline: typeof v.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.deadline) && !isNaN(Date.parse(v.deadline)) ? v.deadline : null,
    amount: v.amount ? clean(v.amount, 120) || null : null,
  };
  const addFlag = (f: string) => {
    if (!out.eligibility_flags.includes(f)) out.eligibility_flags.push(f);
  };
  const capScore = (max: number) => (out.fit_score = Math.min(out.fit_score, max));

  // Rule 1: a 501(c)(3)-only opportunity can't be "apply" for an org that isn't one and has no partner.
  const canUse501c3Only = org.is_501c3 || org.has_nonprofit_partner;
  if (!canUse501c3Only) {
    const statedByAgent = [out.reasons, ...out.eligibility_flags].some((t) => REQUIRES_501C3.test(t));
    if (statedByAgent && out.verdict !== "skip") {
      out.verdict = "skip";
      capScore(20);
      addFlag("Requires 501(c)(3)");
      out.reasons = clean(`${out.reasons} Requires 501(c)(3) status, which ${org.name} doesn't have.`, 600);
    } else if (out.verdict === "apply" && PAGE_501C3.test(pageText)) {
      out.verdict = "maybe";
      capScore(45);
      addFlag("Page mentions 501(c)(3) eligibility");
      out.reasons = clean(`${out.reasons} The page mentions 501(c)(3) eligibility; check whether ${org.name} qualifies.`, 600);
    }
  }

  // Rule 2: a deadline that has already passed can't be "apply".
  const today = new Date().toISOString().slice(0, 10);
  if (out.verdict === "apply" && out.deadline && out.deadline < today) {
    out.verdict = "maybe";
    capScore(45);
    addFlag("Deadline may have passed");
  }

  // Rule 3: the score has to agree with the verdict.
  if (out.verdict === "skip") capScore(40);
  return out;
}
