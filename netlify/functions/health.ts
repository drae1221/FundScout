import Anthropic from "@anthropic-ai/sdk";

// Tiny test function: proves Netlify Functions deploy and run.
// Also reports which environment variables are set (names and yes/no checks only, never values).
export default async () => {
  const required = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "N8N_WEBHOOK_URL"];
  const envSet = Object.fromEntries(required.map((name) => [name, Boolean(process.env[name])]));
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  const anthropicKey = {
    looksLikeAnthropicKey: key.trim().startsWith("sk-ant-"),
    hasSpacesOrNewlines: /\s/.test(key),
    otherAnthropicSettings: ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"].filter((n) => process.env[n]),
  };
  let client = "ok";
  try {
    new Anthropic();
  } catch (err) {
    client = (err as Error).message;
  }
  return Response.json({ ok: true, envSet, anthropicKey, client });
};

export const config = { path: "/api/health" };
