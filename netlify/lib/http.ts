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
