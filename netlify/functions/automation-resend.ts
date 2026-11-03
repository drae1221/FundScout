import { db } from "../lib/db";
import { notMember, requireUser, roleIn } from "../lib/auth";
import { sendToAutomation } from "../lib/automation";
import { isUuid, readJson } from "../lib/http";

// POST /api/automation-resend { scan_id }
// Sends a finished scan to n8n again (email + calendar), for testing without paying for a
// new scan. Members of the club only, at most once an hour per club.
const COOLDOWN_MS = 60 * 60 * 1000;

export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.scan_id)) return Response.json({ error: "scan_id is required" }, { status: 400 });

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { data: scan } = await db.from("scans").select("org_id").eq("id", body.scan_id).maybeSingle();
  if (!scan || !(await roleIn(user, scan.org_id))) return notMember();

  const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const { data: recent } = await db.from("scans").select("digest_sent_at").eq("org_id", scan.org_id).gte("digest_sent_at", since).limit(1);
  if (recent?.length) {
    return Response.json({ error: "A digest was already sent for this club in the last hour. Try again later." }, { status: 429 });
  }

  await sendToAutomation(body.scan_id);
  return Response.json({ ok: true });
};

export const config = { path: "/api/automation-resend" };
