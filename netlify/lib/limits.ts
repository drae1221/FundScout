import { db } from "./db";

// Spending limits for paid AI calls, per organization. Change the numbers here.
export const LIMITS = {
  scan: 5, // scans per club per day (each scan runs the Scout plus one Fit agent per candidate)
  draft: 20, // drafts per club per day
  recheck: 20, // re-checks per club per day
  staleScanMinutes: 20, // a scan still "running" after this long is treated as crashed
};

type Kind = "scan" | "draft" | "recheck";
const LABEL: Record<Kind, string> = { scan: "scans", draft: "drafts", recheck: "re-checks" };

// Checks the club's last 24 hours. Returns a 429 response if the limit is reached;
// otherwise records this job and returns null.
export async function useAllowance(orgId: string, kind: Kind, email: string): Promise<Response | null> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("kind", kind)
    .gte("created_at", since);
  if (error) {
    console.error("usage check failed:", error.message);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
  if ((count ?? 0) >= LIMITS[kind]) {
    return Response.json(
      { error: `Daily limit reached: this club can run ${LIMITS[kind]} ${LABEL[kind]} per day. Try again tomorrow.` },
      { status: 429 },
    );
  }
  await db.from("usage_events").insert({ org_id: orgId, kind, user_email: email });
  return null;
}
