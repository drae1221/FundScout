import { db } from "../lib/db";
import { notMember, requireUser, roleIn } from "../lib/auth";
import { isUuid, serverError } from "../lib/http";

// GET /api/scan-status?scan_id=...  or  ?org_id=... (latest scan for that org)
// Returns the scan, its activity log and its opportunities. Members of the club only.
export default async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const params = new URL(req.url).searchParams;
  let scanId = params.get("scan_id");
  let orgId = params.get("org_id");
  if (scanId && !isUuid(scanId)) return Response.json({ error: "Bad scan_id" }, { status: 400 });
  if (!scanId && !isUuid(orgId)) return Response.json({ error: "scan_id or org_id is required" }, { status: 400 });

  if (scanId) {
    // The club comes from the scan itself, not from the browser.
    const { data } = await db.from("scans").select("org_id").eq("id", scanId).maybeSingle();
    orgId = data?.org_id ?? null;
  }
  if (!orgId || !(await roleIn(user, orgId))) return notMember();

  if (!scanId) {
    const { data } = await db.from("scans").select("id").eq("org_id", orgId).order("started_at", { ascending: false }).limit(1);
    scanId = data?.[0]?.id ?? null;
  }
  if (!scanId) return Response.json({ scan: null, log: [], opportunities: [] });

  const [scan, log, opportunities] = await Promise.all([
    db.from("scans").select("*").eq("id", scanId).maybeSingle(),
    db.from("activity_log").select("step,message,created_at").eq("scan_id", scanId).order("created_at"),
    db.from("opportunities").select("*").eq("scan_id", scanId).order("fit_score", { ascending: false }),
  ]);
  const error = scan.error ?? log.error ?? opportunities.error;
  if (error) return serverError("scan-status", error);

  return Response.json({ scan: scan.data, log: log.data, opportunities: opportunities.data });
};

export const config = { path: "/api/scan-status" };
