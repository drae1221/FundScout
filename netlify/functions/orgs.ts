import { db } from "../lib/db";
import { requireUser } from "../lib/auth";
import { serverError } from "../lib/http";

// GET /api/orgs: the org picker on the dashboard. Only the organizations you belong to,
// clubs first, then A to Z.
export default async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { data: mine, error: memberError } = await db.from("org_members").select("org_id").eq("email", user.email);
  if (memberError) return serverError("orgs", memberError);
  if (!mine.length) return Response.json([]);

  const { data, error } = await db
    .from("orgs")
    .select("id,name,type")
    .in("id", mine.map((m) => m.org_id))
    .order("type", { ascending: false })
    .order("name");
  if (error) return serverError("orgs", error);
  return Response.json(data);
};

export const config = { path: "/api/orgs" };
