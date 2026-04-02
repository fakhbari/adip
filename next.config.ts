import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Force clear cache
  experimental: {
    // Enable webpack for dev mode to avoid Turbopack issues
  },
};

export default nextConfig;
