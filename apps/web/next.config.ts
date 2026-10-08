import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Rewrites are resolved by `next build` and stored in the build output, so API_URL
  // must be the API's address as the web server will see it *when building* (Docker:
  // the `API_URL` build arg in docker-compose.yml). Changing it later needs a rebuild.
  // The default keeps CI/typegen valid when no external API URL is configured.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
