import { db, logStep } from "../lib/db";

// POST /api/automation-log { scan_id, message }
// n8n calls this after each step so the step shows in the dashboard's activity log.
export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const { scan_id, message } = await req.json().catch(() => ({}));
  if (typeof scan_id !== "string" || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "scan_id and message are required" }, { status: 400 });
  }
  const { data: scan } = await db.from("scans").select("id").eq("id", scan_id).maybeSingle();
  if (!scan) return Response.json({ error: "Unknown scan" }, { status: 404 });

  await logStep(scan_id, "Automation", message.trim().slice(0, 300));
  return Response.json({ ok: true });
};

export const config = { path: "/api/automation-log" };
