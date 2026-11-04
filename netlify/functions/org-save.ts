import { db } from "../lib/db";
import { requireMember, requireUser } from "../lib/auth";
import { isUuid, readJson, serverError } from "../lib/http";
import { EMAIL } from "../lib/automation";
import { LIMITS } from "../lib/limits";

// POST /api/org-save { id?, ...profile fields }
// Updates an organization (members only) or creates one (anyone who already belongs to
// an organization, up to LIMITS.newOrgsPerUser; the creator becomes its owner).
// Only the profile fields below can be set.
const TEXT = ["name", "university", "mission", "activities", "funding_goals", "past_wins"] as const;
const BOOL = ["is_registered_student_org", "is_501c3", "has_nonprofit_partner"] as const;

export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (body.id !== undefined && !isUuid(body.id)) return Response.json({ error: "Bad id" }, { status: 400 });

  const row: Record<string, unknown> = {};
  for (const k of TEXT) if (k in body) row[k] = typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, 2000) : null;
  for (const k of BOOL) if (k in body) row[k] = body[k] === true;
  if (Array.isArray(body.industry_ties)) row.industry_ties = body.industry_ties.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  if (Array.isArray(body.funding_contacts)) {
    const emails = body.funding_contacts.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    const bad = emails.filter((e) => !EMAIL.test(e));
    if (bad.length) return Response.json({ error: `Not a valid email: ${bad[0].slice(0, 80)}` }, { status: 400 });
    row.funding_contacts = emails.slice(0, 10);
  }
  if ("type" in body) row.type = body.type === "nonprofit" ? "nonprofit" : "student_club";
  for (const k of ["member_count", "target_amount"]) {
    if (k in body) row[k] = body[k] === "" || body[k] === null || isNaN(Number(body[k])) ? null : Math.max(0, Number(body[k]));
  }
  if (!body.id && !row.name) return Response.json({ error: "Name is required" }, { status: 400 });
  if ("name" in row && !row.name) return Response.json({ error: "Name can't be empty" }, { status: 400 });

  if (body.id) {
    const auth = await requireMember(req, body.id as string);
    if (auth instanceof Response) return auth;
    const { data, error } = await db.from("orgs").update(row).eq("id", body.id).select().single();
    if (error) return serverError("org-save", error);
    return Response.json(data);
  }

  // New organization: only people who already belong to one can create more.
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { data: mine } = await db.from("org_members").select("org_id").eq("email", user.email).limit(1);
  if (!mine?.length) return Response.json({ error: "Ask a club officer to add you as a member first." }, { status: 403 });

  // Each new club gets its own daily allowance, so cap how many one person can create.
  // The database trigger from migration 007 enforces the same cap inside the insert.
  const tooMany = Response.json({ error: `You can create up to ${LIMITS.newOrgsPerUser} organizations.` }, { status: 429 });
  const { count } = await db.from("orgs").select("id", { count: "exact", head: true }).eq("created_by", user.email);
  if ((count ?? 0) >= LIMITS.newOrgsPerUser) return tooMany;

  const { data, error } = await db.from("orgs").insert({ ...row, created_by: user.email }).select().single();
  if (error?.message.includes("org_limit_reached")) return tooMany;
  if (error) return serverError("org-save", error);
  const { error: memberError } = await db.from("org_members").insert({ org_id: data.id, email: user.email, role: "owner", added_by: user.email });
  if (memberError) return serverError("org-save", memberError);
  return Response.json(data);
};

export const config = { path: "/api/org-save" };
