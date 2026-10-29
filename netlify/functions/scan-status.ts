import { db } from "../lib/db";

// GET /api/scan-status?scan_id=...  or  ?org_id=... (latest scan for that org)
// Returns the scan, its activity log and its opportunities.
export default async (req: Request) => {
  const params = new URL(req.url).searchParams;
  let scanId = params.get("scan_id");

  if (!scanId && params.get("org_id")) {
    const { data } = await db
      .from("scans")
      .select("id")
      .eq("org_id", params.get("org_id")!)
      .order("started_at", { ascending: false })
      .limit(1);
    scanId = data?.[0]?.id ?? null;
  }
  if (!scanId) return Response.json({ scan: null, log: [], opportunities: [] });

  const [scan, log, opportunities] = await Promise.all([
    db.from("scans").select("*").eq("id", scanId).maybeSingle(),
    db.from("activity_log").select("step,message,created_at").eq("scan_id", scanId).order("created_at"),
    db.from("opportunities").select("*").eq("scan_id", scanId).order("fit_score", { ascending: false }),
  ]);
  const error = scan.error ?? log.error ?? opportunities.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ scan: scan.data, log: log.data, opportunities: opportunities.data });
};

export const config = { path: "/api/scan-status" };
