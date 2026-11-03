import { db } from "../lib/db";
import { notMember, requireUser, roleIn } from "../lib/auth";
import { isUuid, serverError } from "../lib/http";

// GET /api/opportunity?id=...: one opportunity, its latest draft and the Drafter's log lines.
// Members of the opportunity's club only.
export default async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return Response.json({ error: "id is required" }, { status: 400 });

  const { data: opportunity, error } = await db.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (error) return serverError("opportunity", error);
  // Unknown id and "not your club" look the same, so ids can't be probed.
  if (!opportunity || !(await roleIn(user, opportunity.org_id))) return notMember();

  const [org, draft, log] = await Promise.all([
    db.from("orgs").select("id,name").eq("id", opportunity.org_id).single(),
    db.from("drafts").select("*").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(1),
    db.from("activity_log").select("step,message,created_at").eq("scan_id", opportunity.scan_id).in("step", ["Drafter", "Fit"]).order("created_at"),
  ]);

  return Response.json({
    opportunity,
    org: org.data,
    draft: draft.data?.[0] ?? (await earlierDraft(opportunity)),
    // Drafter and re-check lines always quote the title, so this keeps only this opportunity's lines.
    log: (log.data ?? []).filter(
      (l) => l.message.includes(`"${opportunity.title}"`) && (l.step === "Drafter" || /^(Re-check|Couldn't re-check)/.test(l.message)),
    ),
  });
};

export const config = { path: "/api/opportunity" };

// A fresh scan creates new cards, so reuse the newest draft written for the same
// opportunity in an earlier scan: same club and same library source (titles can vary),
// or for web finds, the same page and title.
async function earlierDraft(o: { id: string; org_id: string; url: string; title: string; library_id: string | null }) {
  let query = db.from("opportunities").select("id").eq("org_id", o.org_id).neq("id", o.id);
  query = o.library_id ? query.eq("library_id", o.library_id) : query.eq("url", o.url).eq("title", o.title);
  const { data: same } = await query;
  if (!same?.length) return null;
  const { data } = await db
    .from("drafts")
    .select("*")
    .in("opportunity_id", same.map((x) => x.id))
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}
