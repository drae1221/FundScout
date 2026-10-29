import type Anthropic from "@anthropic-ai/sdk";
import { db, logStep, type Org } from "./db";
import { runAgent } from "./claude";

export interface Candidate {
  title: string;
  provider: string;
  url: string;
  source: "library" | "grants_gov" | "web";
  library_id: string | null;
  audience: "club" | "members";
  amount: string | null;
  why: string;
}

const yesNo = (v: boolean) => (v ? "yes" : "no");

// Plain-text profile shared by every agent prompt.
export function describeOrg(org: Org): string {
  return [
    `Name: ${org.name}`,
    `Type: ${org.type === "student_club" ? "student club" : "nonprofit"}${org.university ? ` at ${org.university}` : ""}`,
    `Registered student organization: ${yesNo(org.is_registered_student_org)}`,
    `501(c)(3): ${yesNo(org.is_501c3)}; has nonprofit partner: ${yesNo(org.has_nonprofit_partner)}`,
    `Members: ${org.member_count ?? "unknown"}`,
    `Industry ties: ${org.industry_ties.join(", ") || "none listed"}`,
    `Mission: ${org.mission ?? "unknown"}`,
    `Activities: ${org.activities ?? "unknown"}`,
    `Funding goals: ${org.funding_goals ?? "unknown"}`,
    `Target amount: ${org.target_amount ?? "unknown"}`,
    `Past wins: ${org.past_wins ?? "unknown"}`,
  ].join("\n");
}

const SYSTEM = `You are the Scout agent in FundScout, a tool that finds funding for student clubs and small nonprofits. Your job is to find candidate opportunities for one organization and submit them with the submit_candidates tool.

Look for two audiences:
- club: money for the organization itself (university student-government funds, college or department funds, grants, corporate sponsorship of student orgs, awards).
- members: opportunities that individual members could apply for and that match the club's focus: scholarships, conference or competition travel awards, student competitions with prizes, and company programs for students in the field. Prefer ones open to CU Boulder or Colorado students, or open nationally to undergraduates.

How to work:
- Start with query_funding_library. These are hand-checked sources; include each one the organization could plausibly use.
- search_grants_gov searches federal grants, which nearly always require a 501(c)(3) or government entity. For a nonprofit, search it with a few relevant keywords. For a student club, run one search and always pass on the one or two most relevant results, even if they look out of reach, so the Fit agent can check eligibility and show the club why.
- Use web_search for member opportunities and for outside club funding. Write specific queries that name the field, the student level and the year or location.
- If results are thin, try different keywords before giving up.
- You have about 8 tool calls in total, so plan them.

Rules:
- Only submit candidates whose URL appeared in a tool result. Never invent or guess a URL, amount or deadline. Leave amount null if no result stated one.
- Leave out anything clearly expired, or clearly for a different field or a different school.
- Prefer the official page of a specific program over list articles, blog roundups or social media posts.
- Aim for 10 to 16 candidates: every library source the organization can use, the Grants.gov picks, outside club funding such as sponsorships or awards, and at least 4 member opportunities. Give each one a single-sentence reason it might fit.
- Profile fields that say "[PLACEHOLDER: ...]" or "unknown" are not known yet. Do not treat them as facts.`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "query_funding_library",
    description:
      "List hand-curated funding sources (mostly CU Boulder student funding). Filter by category and/or audience, or pass null to get everything.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        category: { anyOf: [{ type: "string", enum: ["events", "operational", "travel", "general"] }, { type: "null" }] },
        audience: { anyOf: [{ type: "string", enum: ["club", "members"] }, { type: "null" }] },
      },
      required: ["category", "audience"],
      additionalProperties: false,
    },
  },
  {
    name: "search_grants_gov",
    description: "Search open and forecasted federal grants on Grants.gov by keyword. Returns up to 8 results with links.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { keyword: { type: "string", description: "Short keyword phrase, e.g. 'STEM education youth'" } },
      required: ["keyword"],
      additionalProperties: false,
    },
  },
  { type: "web_search_20260209", name: "web_search", max_uses: 4 },
  {
    name: "submit_candidates",
    description: "Submit your final list of candidate opportunities. Call this once, when you are done searching.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              provider: { type: "string" },
              url: { type: "string", description: "Exact URL from a tool result" },
              source: { type: "string", enum: ["library", "grants_gov", "web"] },
              library_id: { type: ["string", "null"], description: "The id, for library entries; otherwise null" },
              audience: { type: "string", enum: ["club", "members"] },
              amount: { type: ["string", "null"] },
              why: { type: "string" },
            },
            required: ["title", "provider", "url", "source", "library_id", "audience", "amount", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  },
];

const decodeHtml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, "");

export async function scout(org: Org, scanId: string): Promise<{ candidates: Candidate[]; sourcesChecked: string[] }> {
  const seenUrls = new Set<string>(); // guardrail: every candidate URL must come from a real result
  const libraryUrls = new Map<string, string>();
  const sourcesChecked = new Set<string>();

  const handlers = {
    query_funding_library: async (input: { category: string | null; audience: string | null }) => {
      sourcesChecked.add("CU funding library");
      let query = db.from("funding_library").select("id,name,provider,type,funding_category,audience,eligibility_notes,typical_amount,deadline_notes,url");
      if (input.category) query = query.eq("funding_category", input.category);
      if (input.audience) query = query.eq("audience", input.audience);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      data.forEach((row) => {
        seenUrls.add(normalizeUrl(row.url));
        libraryUrls.set(row.id, row.url);
      });
      await logStep(scanId, "Scout", `Checked the FundScout funding library: ${data.length} sources`);
      return JSON.stringify(data);
    },

    search_grants_gov: async (input: { keyword: string }) => {
      sourcesChecked.add("Grants.gov");
      await logStep(scanId, "Scout", `Searching Grants.gov for "${input.keyword}"`);
      const res = await fetch("https://api.grants.gov/v1/api/search2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: input.keyword, oppStatuses: "forecasted|posted", rows: 8 }),
      });
      if (!res.ok) throw new Error(`Grants.gov returned ${res.status}`);
      const body = await res.json();
      const hits = (body.data?.oppHits ?? []).map((h: any) => {
        const url = `https://www.grants.gov/search-results-detail/${h.id}`;
        seenUrls.add(url);
        return { title: decodeHtml(h.title), agency: h.agency, status: h.oppStatus, close_date: h.closeDate || null, url };
      });
      return JSON.stringify({ total: body.data?.hitCount ?? 0, results: hits });
    },
  };

  await logStep(scanId, "Scout", `Planning a search for ${org.name}`);
  const result = await runAgent<{ candidates: Candidate[] }>({
    system: SYSTEM,
    prompt: `Today is ${new Date().toISOString().slice(0, 10)}. Find funding opportunities for this organization:\n\n${describeOrg(org)}`,
    tools: TOOLS,
    handlers,
    finishTool: "submit_candidates",
    maxToolCalls: 8,
    onBlock: (block) => {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        sourcesChecked.add("Web search");
        const query = (block.input as { query?: string }).query;
        void logStep(scanId, "Scout", `Searching the web: "${query}"`);
      }
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        block.content.forEach((r) => seenUrls.add(normalizeUrl(r.url)));
      }
    },
  });

  const unique = new Map<string, Candidate>();
  for (const c of result.candidates) {
    if (c.source !== "library" || !c.library_id) c.library_id = null;
    // Library entries always link to the stored official page.
    if (c.source === "library" && c.library_id && libraryUrls.has(c.library_id)) c.url = libraryUrls.get(c.library_id)!;
    if (!seenUrls.has(normalizeUrl(c.url))) {
      await logStep(scanId, "Scout", `Dropped "${c.title}": its link didn't come from a search result`);
      continue;
    }
    unique.set(`${c.title}|${c.url}`, c);
  }
  const candidates = [...unique.values()].slice(0, 20);
  await logStep(scanId, "Scout", `Passing ${candidates.length} candidates to the Fit agent`);
  return { candidates, sourcesChecked: [...sourcesChecked] };
}
