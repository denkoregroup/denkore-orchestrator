import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The approvals page and the Conductor (run from server actions, the
  // step-complete webhook and the tick route) read registry/*.yaml at
  // runtime; make sure the files ship with every server bundle.
  outputFileTracingIncludes: {
    "/**": ["./registry/**/*.yaml"],
  },
  // /audit was renamed /activity (it is the Conductor's event log, not the site audits). Old links
  // and bookmarks keep working; query strings such as ?run=<id> pass through.
  async redirects() {
    return [{ source: "/audit", destination: "/activity", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
