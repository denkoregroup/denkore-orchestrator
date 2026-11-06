import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The approvals page and the Conductor (run from server actions, the
  // step-complete webhook and the tick route) read registry/*.yaml at
  // runtime; make sure the files ship with every server bundle.
  outputFileTracingIncludes: {
    "/**": ["./registry/**/*.yaml"],
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
