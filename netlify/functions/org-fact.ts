import { db, type ConfirmedFact } from "../lib/db";

// POST /api/org-fact { org_id, requirement, answer, from_opportunity? }  adds a confirmed fact
// POST /api/org-fact { org_id, remove: index }                           removes one
export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const body = await req.json().catch(() => ({}));
  const { data: org, error } = await db.from("orgs").select("confirmed_facts").eq("id", body.org_id ?? "").maybeSingle();
  if (error) {
    const hint = /confirmed_facts/.test(error.message) ? " (run supabase/migrations/003_confirmed_facts.sql)" : "";
    return Response.json({ error: error.message + hint }, { status: 500 });
  }
  if (!org) return Response.json({ error: "Unknown organization" }, { status: 404 });

  let facts: ConfirmedFact[] = Array.isArray(org.confirmed_facts) ? org.confirmed_facts : [];
  if (typeof body.remove === "number") {
    facts = facts.filter((_, i) => i !== body.remove);
  } else {
    const requirement = String(body.requirement ?? "").trim().slice(0, 300);
    const answer = String(body.answer ?? "").trim().slice(0, 1000);
    if (!requirement || !answer) return Response.json({ error: "requirement and answer are required" }, { status: 400 });
    // One answer per requirement: a new answer replaces the old one.
    facts = [
      ...facts.filter((f) => f.requirement.toLowerCase() !== requirement.toLowerCase()),
      { requirement, answer, added_at: new Date().toISOString(), from_opportunity: body.from_opportunity ?? null },
    ];
  }

  const { data, error: saveError } = await db.from("orgs").update({ confirmed_facts: facts }).eq("id", body.org_id).select("confirmed_facts").single();
  if (saveError) return Response.json({ error: saveError.message }, { status: 500 });
  return Response.json(data.confirmed_facts);
};

export const config = { path: "/api/org-fact" };
