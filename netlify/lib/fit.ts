import type Anthropic from "@anthropic-ai/sdk";
import { logStep, type Org } from "./db";
import { runAgent } from "./claude";
import { describeOrg, type Candidate } from "./scout";

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
1. Read the official details. For Grants.gov opportunities, call fetch_grants_gov_details with the opportunity id (their web pages don't load). For everything else, read the page with web_fetch, using the URL you are given. If the details are unavailable or unclear, decide only from what you have, say what you couldn't check, and lean toward "maybe".
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
- Facts under "Confirmed by the club" are confirmed true by the club's officers. Use them to settle eligibility questions they answer, and say so in the reasons (for example "The club confirmed it is affiliated with Arts & Sciences").`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
  {
    name: "fetch_grants_gov_details",
    description:
      "Get the official details of a Grants.gov opportunity: who may apply, cost sharing, deadline, award amounts and description.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { opportunity_id: { type: "string", description: "Numeric id from the grants.gov URL" } },
      required: ["opportunity_id"],
      additionalProperties: false,
    },
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
  const prompt = `Today is ${new Date().toISOString().slice(0, 10)}.

Organization:
${describeOrg(org)}

Opportunity (${c.audience === "members" ? "for members" : "for the club"}):
Title: ${c.title}
Provider: ${c.provider}
URL: ${c.url}${grantsGovId ? `\nGrants.gov opportunity id: ${grantsGovId}` : ""}
Amount (from search): ${c.amount ?? "unknown"}
Scout's note: ${c.why}`;

  const v = await runAgent<Verdict>({
    system: SYSTEM,
    prompt,
    tools: TOOLS,
    handlers: {
      fetch_grants_gov_details: async (input) => {
        await logStep(scanId, "Fit", `Reading the official Grants.gov listing for "${c.title}"`);
        return fetchGrantsGovDetails(input);
      },
    },
    finishTool: "submit_verdict",
    maxToolCalls: 2,
    onBlock: (block) => {
      if (block.type === "server_tool_use" && block.name === "web_fetch") {
        void logStep(scanId, "Fit", `Reading the page for "${c.title}"`);
      }
    },
  });

  return {
    ...v,
    fit_score: Math.max(0, Math.min(100, Math.round(v.fit_score))),
    deadline: v.deadline && /^\d{4}-\d{2}-\d{2}$/.test(v.deadline) ? v.deadline : null,
  };
}
