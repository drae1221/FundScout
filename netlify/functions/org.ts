import { db } from "../lib/db";

// GET /api/org?id=...: one organization's full profile, for the Profile page.
export default async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const { data, error } = await db.from("orgs").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data);
};

export const config = { path: "/api/org" };
