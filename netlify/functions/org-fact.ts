import { db, type ConfirmedFact } from "../lib/db";
import { requireMember } from "../lib/auth";
import { isUuid, readJson, serverError } from "../lib/http";

// POST /api/org-fact { org_id, requirement, answer, from_opportunity? }  adds a confirmed fact
// POST /api/org-fact { org_id, remove: index }                           removes one
// Members only. Each fact records who added it and when.
export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.org_id)) return Response.json({ error: "org_id is required" }, { status: 400 });
  const auth = await requireMember(req, body.org_id);
  if (auth instanceof Response) return auth;

  const { data: org, error } = await db.from("orgs").select("confirmed_facts").eq("id", body.org_id).maybeSingle();
  if (error) return serverError("org-fact", error);
  if (!org) return Response.json({ error: "Unknown organization" }, { status: 404 });

  let facts: ConfirmedFact[] = Array.isArray(org.confirmed_facts) ? org.confirmed_facts : [];
  if (typeof body.remove === "number") {
    facts = facts.filter((_, i) => i !== body.remove);
  } else {
    const requirement = String(body.requirement ?? "").trim().slice(0, 300);
    const answer = String(body.answer ?? "").trim().slice(0, 1000);
    if (!requirement || !answer) return Response.json({ error: "requirement and answer are required" }, { status: 400 });
    const fromOpportunity = typeof body.from_opportunity === "string" ? body.from_opportunity.slice(0, 300) : null;
    // One answer per requirement: a new answer replaces the old one.
    facts = [
      ...facts.filter((f) => f.requirement.toLowerCase() !== requirement.toLowerCase()),
      { requirement, answer, added_at: new Date().toISOString(), added_by: auth.user.email, from_opportunity: fromOpportunity },
    ];
  }

  const { data, error: saveError } = await db.from("orgs").update({ confirmed_facts: facts }).eq("id", body.org_id).select("confirmed_facts").single();
  if (saveError) return serverError("org-fact", saveError);
  return Response.json(data.confirmed_facts);
};

export const config = { path: "/api/org-fact" };
