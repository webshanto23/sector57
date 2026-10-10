import { AUTH_COOKIES, CSRF_HEADER } from "@s57/shared";
import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Typed API client generated from the API's OpenAPI spec (`pnpm api:types`).
 * Server components call the API directly; the browser goes through the
 * same-origin `/api` rewrite so cookies stay first-party.
 */
export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? process.env.API_URL : "/api",
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The CSRF cookie the API set at login; echoed in a header on every change (double submit). */
export function csrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIES.csrf}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : "";
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit an expired access token. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", headers: { [CSRF_HEADER]: csrfToken() } })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const retries = new WeakMap<Request, Request>();

// Browser only: adds the CSRF header, and after a 401 refreshes the session once and retries.
const browserSession: Middleware = {
  onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method)) request.headers.set(CSRF_HEADER, csrfToken());
    if (!new URL(request.url).pathname.startsWith("/api/auth/")) retries.set(request, request.clone());
  },
  async onResponse({ request, response }) {
    const retry = retries.get(request);
    if (response.status !== 401 || !retry) return response;
    if (!(await refreshSession())) return response;
    retry.headers.set(CSRF_HEADER, csrfToken());
    return fetch(retry);
  },
};

if (typeof window !== "undefined") api.use(browserSession);
