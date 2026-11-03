import { db, loadFacts } from "../lib/db";
import { requireMember } from "../lib/auth";
import { isUuid, readJson, serverError } from "../lib/http";

// POST /api/org-fact { org_id, requirement, answer, from_opportunity? }  adds or replaces a fact
// POST /api/org-fact { org_id, remove: fact id }                         removes one
// Members only. Each fact records who added it and when. Saving is a single upsert: the
// database keeps one answer per requirement per club, so simultaneous saves can't clash.
export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.org_id)) return Response.json({ error: "org_id is required" }, { status: 400 });
  const auth = await requireMember(req, body.org_id);
  if (auth instanceof Response) return auth;

  if (body.remove !== undefined) {
    if (!isUuid(body.remove)) return Response.json({ error: "Bad fact id" }, { status: 400 });
    const { error } = await db.from("org_facts").delete().eq("id", body.remove).eq("org_id", body.org_id);
    if (error) return serverError("org-fact", error);
  } else {
    const requirement = typeof body.requirement === "string" ? body.requirement.trim().slice(0, 300) : "";
    const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 1000) : "";
    if (!requirement || !answer) return Response.json({ error: "requirement and answer are required" }, { status: 400 });
    const { error } = await db.from("org_facts").upsert(
      {
        org_id: body.org_id,
        requirement,
        answer,
        added_by: auth.user.email,
        added_at: new Date().toISOString(),
        from_opportunity: typeof body.from_opportunity === "string" ? body.from_opportunity.slice(0, 300) : null,
      },
      { onConflict: "org_id,requirement_key" },
    );
    if (error) return serverError("org-fact", error);
  }

  try {
    return Response.json(await loadFacts(body.org_id));
  } catch (err) {
    return serverError("org-fact", err);
  }
};

export const config = { path: "/api/org-fact" };
