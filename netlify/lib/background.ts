import { createHmac, timingSafeEqual } from "node:crypto";

// Background functions answer "202 accepted" to anyone before they run, so they can't
// send back 401/403. Instead, the browser calls a normal "-start" function that checks
// login and membership, and that function starts the background job with this internal
// token. Background functions ignore any request without it.
// The token is derived from the service key, so no extra setting is needed.
function internalToken(): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_KEY ?? "").update("fundscout-background-v1").digest("hex");
}

export function isInternalRequest(req: Request): boolean {
  const got = req.headers.get("x-fundscout-internal") ?? "";
  const expected = internalToken();
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// Starts a background function (e.g. "scan-background") on this same site.
export async function startBackground(name: string, body: Record<string, unknown>): Promise<boolean> {
  const site = process.env.URL ?? "https://fundscout-cu.netlify.app";
  const res = await fetch(`${site}/.netlify/functions/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FundScout-Internal": internalToken() },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`starting ${name} failed: ${res.status}`);
  return res.ok;
}
