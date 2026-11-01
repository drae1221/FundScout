import { sendToAutomation } from "../lib/automation";

// POST /api/automation-resend { scan_id }
// Sends a finished scan to n8n again, for testing the automation without paying for a new scan.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const { scan_id } = await req.json().catch(() => ({}));
  if (!UUID.test(scan_id ?? "")) return Response.json({ error: "scan_id is required" }, { status: 400 });
  await sendToAutomation(scan_id);
  return Response.json({ ok: true });
};

export const config = { path: "/api/automation-resend" };
