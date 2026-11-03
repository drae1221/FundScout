// Small helpers shared by the API functions.

// Logs the real error on the server (Netlify's function log) and gives the browser
// a generic message, so database details never leak to the page.
export function serverError(where: string, err: unknown) {
  console.error(`${where}:`, err instanceof Error ? err.message : err);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

// True only for real web links. Blocks javascript:, data: and other schemes
// that could run code when someone clicks the link.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const MAX_BODY = 10_000; // bytes; every request body FundScout sends is far smaller

// Reads a JSON object body safely: rejects bodies over 10 KB, broken JSON and non-objects.
// Returns the object, or a 400/413 response to send back.
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const text = await req.text().catch(() => null);
  if (text === null) return Response.json({ error: "Bad request" }, { status: 400 });
  if (new TextEncoder().encode(text).length > MAX_BODY) return Response.json({ error: "Request too large" }, { status: 413 });
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // fall through
  }
  return Response.json({ error: "Bad request" }, { status: 400 });
}
