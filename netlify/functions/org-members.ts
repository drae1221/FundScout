import { db } from "../lib/db";
import { requireMember } from "../lib/auth";
import { isUuid, readJson, serverError } from "../lib/http";
import { EMAIL } from "../lib/automation";

// GET  /api/org-members?org_id=...                 lists the club's members (members only)
// POST /api/org-members { org_id, add: email, role? } adds an officer (owners only)
// POST /api/org-members { org_id, remove: email }     removes one (owners only, not yourself)
export default async (req: Request) => {
  if (req.method === "GET") {
    const orgId = new URL(req.url).searchParams.get("org_id");
    if (!isUuid(orgId)) return Response.json({ error: "org_id is required" }, { status: 400 });
    const auth = await requireMember(req, orgId);
    if (auth instanceof Response) return auth;
    return list(orgId);
  }

  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isUuid(body.org_id)) return Response.json({ error: "org_id is required" }, { status: 400 });
  const auth = await requireMember(req, body.org_id);
  if (auth instanceof Response) return auth;
  if (auth.role !== "owner") return Response.json({ error: "Only the club's owners can change members." }, { status: 403 });

  if (typeof body.add === "string") {
    const email = body.add.trim().toLowerCase();
    if (!EMAIL.test(email)) return Response.json({ error: "That isn't a valid email." }, { status: 400 });
    const role = body.role === "owner" ? "owner" : "member";
    const { error } = await db.from("org_members").upsert({ org_id: body.org_id, email, role, added_by: auth.user.email }, { onConflict: "org_id,email" });
    if (error) return serverError("org-members", error);
  } else if (typeof body.remove === "string") {
    const email = body.remove.trim().toLowerCase();
    if (email === auth.user.email) return Response.json({ error: "You can't remove yourself." }, { status: 400 });
    const { error } = await db.from("org_members").delete().eq("org_id", body.org_id).eq("email", email);
    if (error) return serverError("org-members", error);
  } else {
    return Response.json({ error: "add or remove is required" }, { status: 400 });
  }
  return list(body.org_id);
};

async function list(orgId: string) {
  const { data, error } = await db.from("org_members").select("email,role,added_by,created_at").eq("org_id", orgId).order("created_at");
  if (error) return serverError("org-members", error);
  return Response.json(data);
}

export const config = { path: "/api/org-members" };
