// Tiny test function: proves Netlify Functions deploy and run. Says nothing about
// which secrets are set, so it is safe to leave public.
export default async () => Response.json({ ok: true });

export const config = { path: "/api/health" };
