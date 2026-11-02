import { db } from "../lib/db";

// POST /api/org-save { id?, ...profile fields }
// Creates an organization (no id) or updates one. Only the profile fields below can be set.
const TEXT = ["name", "university", "mission", "activities", "funding_goals", "past_wins"] as const;
const BOOL = ["is_registered_student_org", "is_501c3", "has_nonprofit_partner"] as const;
const LIST = ["industry_ties", "funding_contacts"] as const;

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Bad request" }, { status: 400 });

  const row: Record<string, unknown> = {};
  for (const k of TEXT) if (k in body) row[k] = typeof body[k] === "string" && body[k].trim() ? body[k].trim().slice(0, 2000) : null;
  for (const k of BOOL) if (k in body) row[k] = Boolean(body[k]);
  for (const k of LIST) {
    if (Array.isArray(body[k])) row[k] = body[k].map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 20);
  }
  if ("type" in body) row.type = body.type === "nonprofit" ? "nonprofit" : "student_club";
  for (const k of ["member_count", "target_amount"]) {
    if (k in body) row[k] = body[k] === "" || body[k] === null || isNaN(Number(body[k])) ? null : Number(body[k]);
  }
  if (!body.id && !row.name) return Response.json({ error: "Name is required" }, { status: 400 });
  if ("name" in row && !row.name) return Response.json({ error: "Name can't be empty" }, { status: 400 });

  const query = body.id ? db.from("orgs").update(row).eq("id", body.id) : db.from("orgs").insert(row);
  const { data, error } = await query.select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
};

export const config = { path: "/api/org-save" };
