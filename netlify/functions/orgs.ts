import { db } from "../lib/db";

// GET /api/orgs: the org picker on the dashboard. AI Club (the demo club) comes first.
export default async () => {
  const { data, error } = await db.from("orgs").select("id,name,type").order("type", { ascending: false }).order("name"); // clubs first, A to Z
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
};

export const config = { path: "/api/orgs" };
