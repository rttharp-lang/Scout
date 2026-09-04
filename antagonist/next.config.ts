import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three.js is large; keep it out of the server bundle and let Next tree-shake it on the client.
  transpilePackages: ["three"],
  // This app lives inside a larger repo; pin the tracing root so Next doesn't pick the parent lockfile.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
