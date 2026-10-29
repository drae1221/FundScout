// Tiny test function: proves Netlify Functions deploy and run.
// Also reports which environment variables are set (names only, never values).
export default async () => {
  const required = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "N8N_WEBHOOK_URL"];
  const envSet = Object.fromEntries(required.map((name) => [name, Boolean(process.env[name])]));
  return Response.json({ ok: true, envSet });
};

export const config = { path: "/api/health" };
