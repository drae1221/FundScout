import type Anthropic from "@anthropic-ai/sdk";
import { db, logStep, type Org } from "./db";
import { runAgent } from "./claude";
import { describeOrg } from "./scout";
import { fetchGrantsGovDetails } from "./fit";

export interface Draft {
  draft_type: "cu_funding_request" | "grant_application" | "sponsor_pitch";
  content: string;
  assumptions: string[];
  missing_items: string[];
  requirements: string[];
}

const SYSTEM = `You are the Drafter agent in FundScout. You write the first draft of a funding request for one student organization and one funding opportunity, then submit it with the submit_draft tool. A human will edit and submit it; FundScout never submits anything.

Steps:
1. Read the opportunity's requirements. For Grants.gov opportunities, call fetch_grants_gov_details. Otherwise read the page with web_fetch, using the URL you are given. Note what the application asks for.
2. Choose the draft type:
   - cu_funding_request: CU Boulder student-government or university funds (requests go through BuffConnect).
   - grant_application: foundation or government grants.
   - sponsor_pitch: asking a company to sponsor the club.
3. Write the draft in Markdown: a short title (#), then sections (##) that match what the application asks for. Keep it under 400 words, plain and specific.
4. List the requirements as a short checklist of what the application needs (documents, deadlines, rules), taken from the page.

Hard rules (these are shown on the product's trust slide):
- Use only facts from the organization profile and the opportunity page. Never invent numbers, dates, names, quotes or results.
- When you need a fact the profile doesn't have (a cost, an event date, an attendance estimate), write a placeholder inline: [[MISSING: what is needed]]. Also add it to missing_items.
- When you had to make a reasonable guess or generalization that isn't stated in the profile, mark it inline: [[ASSUMED: the guessed text]]. Also add it to assumptions.
- Profile fields that say "[PLACEHOLDER: ...]" or "unknown" are not known yet. Treat them as missing.
- Never mention tools, tool limits or technical errors in the draft or lists.`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
  {
    name: "fetch_grants_gov_details",
    description: "Get the official details of a Grants.gov opportunity: who may apply, cost sharing, deadline, award amounts and description.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { opportunity_id: { type: "string", description: "Numeric id from the grants.gov URL" } },
      required: ["opportunity_id"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_draft",
    description: "Submit the finished draft. Call this once.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        draft_type: { type: "string", enum: ["cu_funding_request", "grant_application", "sponsor_pitch"] },
        content: { type: "string", description: "Markdown draft with [[MISSING: ...]] and [[ASSUMED: ...]] markers inline" },
        assumptions: { type: "array", items: { type: "string" } },
        missing_items: { type: "array", items: { type: "string" } },
        requirements: { type: "array", items: { type: "string" } },
      },
      required: ["draft_type", "content", "assumptions", "missing_items", "requirements"],
      additionalProperties: false,
    },
  },
];

// Writes a draft for one opportunity and saves it. Progress goes to the scan's activity log.
export async function writeDraft(opportunityId: string) {
  const { data: opp, error } = await db.from("opportunities").select("*").eq("id", opportunityId).single();
  if (error) throw new Error(`Opportunity not found: ${error.message}`);
  const log = (message: string) => logStep(opp.scan_id, "Drafter", message);

  try {
    const { data: org, error: orgError } = await db.from("orgs").select("*").eq("id", opp.org_id).single<Org>();
    if (orgError) throw new Error(orgError.message);
    const { data: lib } = opp.library_id
      ? await db.from("funding_library").select("eligibility_notes,typical_amount,deadline_notes").eq("id", opp.library_id).maybeSingle()
      : { data: null };

    await log(`Writing a draft for "${opp.title}"`);
    const grantsGovId = opp.source === "grants_gov" ? opp.url.match(/(\d+)\/?$/)?.[1] : undefined;
    const prompt = `Today is ${new Date().toISOString().slice(0, 10)}.

Organization:
${describeOrg(org)}

Opportunity:
Title: ${opp.title}
Provider: ${opp.provider ?? "unknown"}
URL: ${opp.url}${grantsGovId ? `\nGrants.gov opportunity id: ${grantsGovId}` : ""}
Amount: ${opp.amount ?? "unknown"}
Deadline: ${opp.deadline ?? "unknown"} (not yet verified)
Why it fits (from the Fit agent): ${opp.reasons}${
      lib ? `\nHand-checked notes: ${lib.eligibility_notes} Typical amount: ${lib.typical_amount} Deadlines: ${lib.deadline_notes}` : ""
    }`;

    const draft = await runAgent<Draft>({
      system: SYSTEM,
      prompt,
      tools: TOOLS,
      handlers: {
        fetch_grants_gov_details: async (input) => {
          await log(`Reading the official Grants.gov listing for "${opp.title}"`);
          return fetchGrantsGovDetails(input);
        },
      },
      finishTool: "submit_draft",
      maxToolCalls: 2,
      onBlock: async (block) => {
        if (block.type === "server_tool_use" && block.name === "web_fetch") await log(`Reading the requirements for "${opp.title}"`);
      },
    });

    // The checklist is stored at the end of the draft's Markdown (the drafts table has no column for it).
    const { requirements, ...rest } = draft;
    const content = requirements.length
      ? `${draft.content.trim()}\n\n## Requirements checklist\n${requirements.map((r) => `- [ ] ${r}`).join("\n")}`
      : draft.content;
    const { error: insertError } = await db.from("drafts").insert({ opportunity_id: opp.id, ...rest, content });
    if (insertError) throw new Error(insertError.message);
    const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    await log(
      `Draft ready for "${opp.title}": ${count(draft.assumptions.length, "assumption")} and ${count(draft.missing_items.length, "missing item")} to check`,
    );
  } catch (err) {
    await log(`Couldn't write the draft for "${opp.title}": ${(err as Error).message}`);
  }
}
