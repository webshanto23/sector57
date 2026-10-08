import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except API rewrites, Next internals and files with an extension.
  // The dot must be escaped twice: a single `\.` in a JS string is just `.`, which skips every Bangla subpath.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
