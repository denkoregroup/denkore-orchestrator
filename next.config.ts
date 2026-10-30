import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /approvals reads registry/*.yaml at runtime (page and decision action);
  // make sure the files ship with its server bundle.
  outputFileTracingIncludes: {
    "/approvals": ["./registry/**/*.yaml"],
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
