import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HQ is private and fully dynamic (every page depends on the signed-in partner),
  // so we use plain request-time rendering instead of Cache Components.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
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
