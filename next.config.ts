import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1 serves everything from a mutable in-memory mock store, so pages render
  // per request. Revisit Cache Components when the Turso repositories land (phase 2).
  cacheComponents: false,
  partialPrefetching: false,
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
