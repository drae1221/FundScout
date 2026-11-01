import { db } from "../lib/db";

// GET /api/opportunity?id=...: one opportunity, its latest draft and the Drafter's log lines.
export default async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const { data: opportunity, error } = await db.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!opportunity) return Response.json({ error: "Not found" }, { status: 404 });

  const [org, draft, log] = await Promise.all([
    db.from("orgs").select("id,name").eq("id", opportunity.org_id).single(),
    db.from("drafts").select("*").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(1),
    db.from("activity_log").select("step,message,created_at").eq("scan_id", opportunity.scan_id).eq("step", "Drafter").order("created_at"),
  ]);

  return Response.json({
    opportunity,
    org: org.data,
    draft: draft.data?.[0] ?? null,
    // Drafter lines always quote the title, so this keeps only this opportunity's lines.
    log: (log.data ?? []).filter((l) => l.message.includes(`"${opportunity.title}"`)),
  });
};

export const config = { path: "/api/opportunity" };
