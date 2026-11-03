import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the service key, so never import this from src/.
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

export interface Org {
  id: string;
  name: string;
  type: "student_club" | "nonprofit";
  university: string | null;
  member_count: number | null;
  is_registered_student_org: boolean;
  is_501c3: boolean;
  has_nonprofit_partner: boolean;
  mission: string | null;
  activities: string | null;
  funding_goals: string | null;
  target_amount: number | null;
  past_wins: string | null;
  industry_ties: string[];
  funding_contacts?: string[];
  confirmed_facts?: ConfirmedFact[]; // loaded from the org_facts table by loadOrg()
}

// Something the club confirmed about itself, e.g. from "We meet this" on an opportunity.
export interface ConfirmedFact {
  id?: string;
  requirement: string;
  answer: string;
  added_at: string;
  added_by?: string | null; // email of the member who confirmed it
  from_opportunity?: string | null;
}

const FACT_COLUMNS = "id,requirement,answer,added_by,added_at,from_opportunity";

export async function loadFacts(orgId: string): Promise<ConfirmedFact[]> {
  const { data, error } = await db.from("org_facts").select(FACT_COLUMNS).eq("org_id", orgId).order("added_at");
  if (error) throw new Error(error.message);
  return data;
}

// An organization's profile plus its confirmed facts, as the agents read it.
export async function loadOrg(orgId: string): Promise<Org> {
  const { data: org, error } = await db.from("orgs").select("*").eq("id", orgId).single<Org>();
  if (error) throw new Error(`Org not found: ${error.message}`);
  return { ...org, confirmed_facts: await loadFacts(orgId) };
}

// Writes one line to the on-screen activity log (and the terminal, for local runs).
export async function logStep(scanId: string, step: string, message: string) {
  console.log(`[${step}] ${message}`);
  const { error } = await db.from("activity_log").insert({ scan_id: scanId, step, message });
  if (error) console.error("activity_log insert failed:", error.message);
}
