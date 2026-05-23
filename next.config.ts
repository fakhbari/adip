import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Surface TypeScript errors at build time. Previously `true`, which masked
  // real type bugs (e.g. unimported FileInfo, schema field-name mismatches).
  typescript: {
    ignoreBuildErrors: false,
  },
  // Strict Mode catches effect / lifecycle bugs in development by double-mounting.
  reactStrictMode: true,
};

export default nextConfig;
