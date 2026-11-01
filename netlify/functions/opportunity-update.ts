import { db } from "../lib/db";

// POST /api/opportunity-update { id, status?, deadline_verified? }
// The detail page's buttons. Only these two fields can change.
const STATUSES = ["new", "in_progress", "submitted", "dismissed"];

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const { id, status, deadline_verified } = await req.json();

  const changes: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return Response.json({ error: "Bad status" }, { status: 400 });
    changes.status = status;
  }
  if (deadline_verified !== undefined) changes.deadline_verified = Boolean(deadline_verified);
  if (!id || Object.keys(changes).length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await db.from("opportunities").update(changes).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
};

export const config = { path: "/api/opportunity-update" };
