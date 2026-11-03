import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { requireMember } from "../lib/auth";
import { startBackground } from "../lib/background";
import { isUuid, readJson, serverError } from "../lib/http";

// POST /api/scan-start { org_id, weekly? }  → 202 { scan_id }
// "Find funding" and "Run weekly scan now". Only members of the club can start a scan,
// and only they (or the scheduled weekly run) can ask for the digest email.
export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.org_id)) return Response.json({ error: "org_id is required" }, { status: 400 });
  if (body.weekly !== undefined && typeof body.weekly !== "boolean") return Response.json({ error: "weekly must be true or false" }, { status: 400 });

  const auth = await requireMember(req, body.org_id);
  if (auth instanceof Response) return auth;

  const scanId = randomUUID();
  const { error } = await db.from("scans").insert({ id: scanId, org_id: body.org_id, status: "running", started_by: auth.user.email });
  if (error) return serverError("scan-start", error);

  if (!(await startBackground("scan-background", { org_id: body.org_id, scan_id: scanId, weekly: body.weekly === true }))) {
    await db.from("scans").update({ status: "failed", finished_at: new Date().toISOString(), error: "Couldn't start the scan." }).eq("id", scanId);
    return Response.json({ error: "Couldn't start the scan. Try again." }, { status: 502 });
  }
  return Response.json({ scan_id: scanId }, { status: 202 });
};

export const config = { path: "/api/scan-start" };
