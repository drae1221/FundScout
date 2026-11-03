import { db } from "./db";

// Login and membership checks, used by every function that reads or changes club data.
// The browser sends the Supabase login token as "Authorization: Bearer <token>".

export interface User {
  id: string;
  email: string; // lower-case, verified by Supabase through the login link
}
export type Role = "owner" | "member";

// The logged-in user, or null if the token is missing, expired or fake.
export async function currentUser(req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

export async function roleIn(user: User, orgId: string): Promise<Role | null> {
  const { data } = await db.from("org_members").select("role").eq("org_id", orgId).eq("email", user.email).maybeSingle();
  return (data?.role as Role) ?? null;
}

export const notLoggedIn = () => Response.json({ error: "Please log in." }, { status: 401 });
export const notMember = () => Response.json({ error: "You're not a member of this organization." }, { status: 403 });

// Logged in, or a 401 response to send back.
export async function requireUser(req: Request): Promise<User | Response> {
  return (await currentUser(req)) ?? notLoggedIn();
}

// Logged in AND a member of the organization, or a 401/403 response to send back.
// orgId must come from the database (the opportunity's or scan's org), or be the
// organization the request is about, never a value used for anything else.
export async function requireMember(req: Request, orgId: string | null | undefined): Promise<{ user: User; role: Role } | Response> {
  const user = await currentUser(req);
  if (!user) return notLoggedIn();
  if (!orgId) return notMember();
  const role = await roleIn(user, orgId);
  return role ? { user, role } : notMember();
}
