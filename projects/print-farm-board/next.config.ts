import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multipart uploads pass through the framework's action request guard.
  // Allow the 10 MiB file plus multipart headers and boundaries.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
