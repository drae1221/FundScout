import { db } from "../lib/db";
import { notMember, requireUser, roleIn } from "../lib/auth";
import { startBackground } from "../lib/background";
import { isUuid, readJson } from "../lib/http";

// POST /api/draft-start { opportunity_id }  → 202
// The detail page's "Write draft" button. Only members of the opportunity's club can start it.
export default async (req: Request) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.opportunity_id)) return Response.json({ error: "opportunity_id is required" }, { status: 400 });

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  // The club comes from the database, not from the browser.
  const { data: opp } = await db.from("opportunities").select("org_id").eq("id", body.opportunity_id).maybeSingle();
  if (!opp || !(await roleIn(user, opp.org_id))) return notMember();

  if (!(await startBackground("draft-background", { opportunity_id: body.opportunity_id }))) {
    return Response.json({ error: "Couldn't start. Try again." }, { status: 502 });
  }
  return Response.json({ ok: true }, { status: 202 });
};

export const config = { path: "/api/draft-start" };
