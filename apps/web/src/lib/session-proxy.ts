import { AUTH_COOKIES, CSRF_HEADER } from "@s57/shared";
import type { NextRequest, NextResponse } from "next/server";

type ResponseCookie = Parameters<NextResponse["cookies"]["set"]>[0] & object;

/** Pages that need a login. The API makes the real decision; this only avoids rendering them for nobody. */
export const PROTECTED_PREFIXES = ["/dashboard"];

/**
 * Query flag on `/login` meaning "the API refused this session". The proxy only
 * checks a token's expiry, so a token that is unexpired but no longer accepted
 * (session revoked, secret changed) would otherwise bounce between `/login` and
 * `/dashboard` forever; with this flag the proxy clears the cookies instead.
 */
export const SESSION_ENDED_PARAM = "ended";

/** Seconds of slack so a token that expires mid-request is refreshed first. */
const EXPIRY_SLACK_S = 30;

/**
 * Reads `exp` from the access token without checking the signature: an
 * optimistic check (the proxy has no secret). The API verifies every request.
 */
export function accessTokenFresh(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp - EXPIRY_SLACK_S > now / 1000;
  } catch {
    return false;
  }
}

/** One `Set-Cookie` header from the API as an object for `response.cookies.set`. */
export function parseSetCookie(line: string): ResponseCookie | null {
  const [pair, ...attributes] = line.split(";").map((part) => part.trim());
  const eq = pair?.indexOf("=") ?? -1;
  if (!pair || eq <= 0) return null;
  const cookie: ResponseCookie = { name: pair.slice(0, eq), value: decodeURIComponent(pair.slice(eq + 1)) };
  for (const attribute of attributes) {
    const [key = "", value = ""] = attribute.split("=");
    switch (key.toLowerCase()) {
      case "max-age":
        cookie.maxAge = Number(value);
        break;
      case "expires":
        cookie.expires = new Date(value);
        break;
      case "path":
        cookie.path = value;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "samesite":
        cookie.sameSite = value.toLowerCase() as "lax" | "strict" | "none";
        break;
    }
  }
  return cookie;
}

/**
 * Swaps the refresh cookie for new tokens on behalf of the browser. Returns the
 * cookies to set, or null when the user has to log in again.
 */
export async function refreshFromProxy(request: NextRequest): Promise<ResponseCookie[] | null> {
  const refresh = request.cookies.get(AUTH_COOKIES.refresh)?.value;
  const csrf = request.cookies.get(AUTH_COOKIES.csrf)?.value;
  if (!refresh || !csrf) return null;

  const headers: Record<string, string> = {
    cookie: `${AUTH_COOKIES.refresh}=${encodeURIComponent(refresh)}; ${AUTH_COOKIES.csrf}=${encodeURIComponent(csrf)}`,
    [CSRF_HEADER]: csrf,
  };
  // So the API records and rate-limits the visitor, not this server.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  if (request.headers.get("user-agent")) headers["user-agent"] = request.headers.get("user-agent")!;

  try {
    const response = await fetch(`${process.env.API_URL ?? "http://localhost:4000"}/auth/refresh`, {
      method: "POST",
      headers,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.headers
      .getSetCookie()
      .map(parseSetCookie)
      .filter((cookie): cookie is ResponseCookie => cookie !== null);
  } catch {
    return null;
  }
}
