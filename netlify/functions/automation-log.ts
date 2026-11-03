import { db, logStep } from "../lib/db";
import { validLogToken } from "../lib/automation";
import { readJson } from "../lib/http";

// POST /api/automation-log { scan_id, message }, header X-FundScout-Log-Token
// n8n calls this after each step so the step shows in the dashboard's activity log.
// Only n8n has the token (FundScout sends it with each scan), so nobody else can
// write "Automation" lines.
export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const { scan_id, message } = body;
  if (typeof scan_id !== "string" || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "scan_id and message are required" }, { status: 400 });
  }
  if (!validLogToken(scan_id, req.headers.get("x-fundscout-log-token"))) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  const { data: scan } = await db.from("scans").select("id").eq("id", scan_id).maybeSingle();
  if (!scan) return Response.json({ error: "Unknown scan" }, { status: 404 });

  await logStep(scan_id, "Automation", message.trim().slice(0, 300));
  return Response.json({ ok: true });
};

export const config = { path: "/api/automation-log" };
