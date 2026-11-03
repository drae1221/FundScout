import { db, loadFacts } from "../lib/db";
import { notMember, requireUser, roleIn } from "../lib/auth";
import { isUuid, serverError } from "../lib/http";

// GET /api/org?id=...: one organization's full profile, for the Profile page. Members only.
export default async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return Response.json({ error: "id is required" }, { status: 400 });
  const role = await roleIn(user, id);
  if (!role) return notMember();

  const { data, error } = await db.from("orgs").select("*").eq("id", id).maybeSingle();
  if (error) return serverError("org", error);
  if (!data) return notMember();
  return Response.json({ ...data, confirmed_facts: await loadFacts(id), my_role: role });
};

export const config = { path: "/api/org" };
