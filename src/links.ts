// True only for real web links. Links that start with javascript:, data: and the like
// could run code when clicked, so they are shown as plain text instead.
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
