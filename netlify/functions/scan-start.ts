import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { requireMember } from "../lib/auth";
import { startBackground } from "../lib/background";
import { isUuid, readJson, serverError } from "../lib/http";
import { LIMITS, useAllowance } from "../lib/limits";

// POST /api/scan-start { org_id, send_digest? }  → 202 { scan_id }
// "Find funding" and "Scan and email the digest". Only members of the club can start a
// scan, and only a member's click can ask for the digest email (send_digest: true).
export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.org_id)) return Response.json({ error: "org_id is required" }, { status: 400 });
  if (body.send_digest !== undefined && typeof body.send_digest !== "boolean") return Response.json({ error: "send_digest must be true or false" }, { status: 400 });

  const auth = await requireMember(req, body.org_id);
  if (auth instanceof Response) return auth;

  // One scan at a time per club (the database enforces it). A scan stuck on "running"
  // for too long crashed, so close it first.
  const stale = new Date(Date.now() - LIMITS.staleScanMinutes * 60_000).toISOString();
  await db.from("scans").update({ status: "failed", finished_at: new Date().toISOString(), error: "Stopped: took too long." })
    .eq("org_id", body.org_id).eq("status", "running").lt("started_at", stale);
  const { data: running } = await db.from("scans").select("id").eq("org_id", body.org_id).eq("status", "running").limit(1);
  if (running?.length) return Response.json({ error: "A scan is already running for this club. Wait for it to finish." }, { status: 409 });

  const overLimit = await useAllowance(body.org_id, "scan", auth.user.email);
  if (overLimit) return overLimit;

  const scanId = randomUUID();
  const { error } = await db.from("scans").insert({ id: scanId, org_id: body.org_id, status: "running", started_by: auth.user.email });
  if (error?.code === "23505") return Response.json({ error: "A scan is already running for this club. Wait for it to finish." }, { status: 409 });
  if (error) return serverError("scan-start", error);

  if (!(await startBackground("scan-background", { org_id: body.org_id, scan_id: scanId, send_digest: body.send_digest === true }))) {
    await db.from("scans").update({ status: "failed", finished_at: new Date().toISOString(), error: "Couldn't start the scan." }).eq("id", scanId);
    return Response.json({ error: "Couldn't start the scan. Try again." }, { status: 502 });
  }
  return Response.json({ scan_id: scanId }, { status: 202 });
};

export const config = { path: "/api/scan-start" };
