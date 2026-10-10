/**
 * Where to go after logging in. Only paths on this site are allowed, so a
 * crafted `?next=https://evil.example` link can't send people elsewhere.
 */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
