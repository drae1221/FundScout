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
}

// Writes one line to the on-screen activity log (and the terminal, for local runs).
export async function logStep(scanId: string, step: string, message: string) {
  console.log(`[${step}] ${message}`);
  const { error } = await db.from("activity_log").insert({ scan_id: scanId, step, message });
  if (error) console.error("activity_log insert failed:", error.message);
}
