import { AUTH_COOKIES } from "@s57/shared";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { accessTokenFresh, PROTECTED_PREFIXES, refreshFromProxy, SESSION_ENDED_PARAM } from "./lib/session-proxy";

const intl = createMiddleware(routing);

/** The path without the `/en` prefix, so both locales share one list of protected pages. */
function pagePath(pathname: string): { path: string; prefix: string } {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return { path: pathname.slice(locale.length + 1) || "/", prefix: `/${locale}` };
    }
  }
  return { path: pathname, prefix: "" };
}

const isProtected = (path: string) => PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

export default async function proxy(request: NextRequest) {
  const { path, prefix } = pagePath(request.nextUrl.pathname);
  const fresh = accessTokenFresh(request.cookies.get(AUTH_COOKIES.access)?.value);

  // The API refused the session: drop its cookies and show the login page.
  if (path === "/login" && request.nextUrl.searchParams.has(SESSION_ENDED_PARAM)) {
    const response = intl(request);
    for (const name of Object.values(AUTH_COOKIES)) response.cookies.delete(name);
    return response;
  }
  // Already logged in: the login page has nothing to offer.
  if (path === "/login" && fresh) {
    return NextResponse.redirect(new URL(`${prefix}/dashboard`, request.url));
  }
  if (!isProtected(path) || fresh) return intl(request);

  // Access token missing or expired: refresh before the page renders, or send to login.
  const cookies = await refreshFromProxy(request);
  if (!cookies) {
    const login = new URL(`${prefix}/login`, request.url);
    login.searchParams.set("next", path);
    const response = NextResponse.redirect(login);
    for (const name of Object.values(AUTH_COOKIES)) response.cookies.delete(name);
    return response;
  }
  // Setting them on the response also makes them visible to `cookies()` in this render.
  const response = intl(request);
  for (const cookie of cookies) response.cookies.set(cookie);
  return response;
}

export const config = {
  // Everything except API rewrites, Next internals and files with an extension.
  // The dot must be escaped twice: a single `\.` in a JS string is just `.`, which skips every Bangla subpath.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
