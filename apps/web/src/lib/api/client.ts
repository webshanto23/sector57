import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Typed API client generated from the API's OpenAPI spec (`pnpm api:types`).
 * Server components call the API directly; the browser goes through the
 * same-origin `/api` rewrite so cookies stay first-party.
 */
export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? process.env.API_URL : "/api",
});
