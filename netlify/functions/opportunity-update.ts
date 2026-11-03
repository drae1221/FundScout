import { db } from "../lib/db";
import { notMember, requireUser, roleIn } from "../lib/auth";
import { isUuid, readJson, serverError } from "../lib/http";

// POST /api/opportunity-update { id, status?, deadline_verified? }
// The detail page's buttons. Members only; records who made the change and when.
const STATUSES = ["new", "in_progress", "submitted", "dismissed"];

export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const { id, status, deadline_verified } = body;
  if (!isUuid(id)) return Response.json({ error: "id is required" }, { status: 400 });
  if (status !== undefined && !STATUSES.includes(status as string)) return Response.json({ error: "Bad status" }, { status: 400 });
  if (deadline_verified !== undefined && typeof deadline_verified !== "boolean") {
    return Response.json({ error: "deadline_verified must be true or false" }, { status: 400 });
  }
  if (status === undefined && deadline_verified === undefined) return Response.json({ error: "Nothing to update" }, { status: 400 });

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { data: opp } = await db.from("opportunities").select("org_id").eq("id", id).maybeSingle();
  if (!opp || !(await roleIn(user, opp.org_id))) return notMember();

  const now = new Date().toISOString();
  const changes: Record<string, unknown> = {};
  if (status !== undefined) Object.assign(changes, { status, status_changed_by: user.email, status_changed_at: now });
  if (deadline_verified !== undefined) {
    Object.assign(changes, deadline_verified
      ? { deadline_verified: true, deadline_verified_by: user.email, deadline_verified_at: now }
      : { deadline_verified: false, deadline_verified_by: null, deadline_verified_at: null });
  }

  const { data, error } = await db.from("opportunities").update(changes).eq("id", id).select().single();
  if (error) return serverError("opportunity-update", error);
  return Response.json(data);
};

export const config = { path: "/api/opportunity-update" };
