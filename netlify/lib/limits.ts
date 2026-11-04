import { db } from "./db";

// Spending limits for paid AI calls. Change the numbers here.
export const LIMITS = {
  perOrg: { scan: 5, draft: 20, recheck: 20 }, // per club per day
  perUser: { scan: 8, draft: 30, recheck: 30 }, // per person per day, across all their clubs
  newOrgsPerUser: 3, // organizations one person can create (also in migration 007's trigger)
  staleScanMinutes: 20, // a scan still "running" after this long is treated as crashed
};

type Kind = "scan" | "draft" | "recheck";
const LABEL: Record<Kind, string> = { scan: "scans", draft: "drafts", recheck: "re-checks" };

// Checks the last 24 hours and records this job in one database transaction
// (use_allowance in migration 007), so parallel requests can't slip past a limit.
// Returns a 429 response if a limit is reached, otherwise null.
export async function useAllowance(orgId: string, kind: Kind, email: string): Promise<Response | null> {
  const { data, error } = await db.rpc("use_allowance", {
    p_org: orgId,
    p_kind: kind,
    p_email: email,
    p_org_limit: LIMITS.perOrg[kind],
    p_user_limit: LIMITS.perUser[kind],
  });
  if (error) {
    console.error("usage check failed:", error.message);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (data === "org_limit") {
    return Response.json({ error: `Daily limit reached: each club can run ${LIMITS.perOrg[kind]} ${LABEL[kind]} per day. Try again tomorrow.` }, { status: 429 });
  }
  if (data === "user_limit") {
    return Response.json({ error: `Daily limit reached: each person can run ${LIMITS.perUser[kind]} ${LABEL[kind]} per day across all their clubs. Try again tomorrow.` }, { status: 429 });
  }
  return null;
}
