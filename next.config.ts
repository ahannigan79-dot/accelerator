import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Bundle the sample intake packs so the sample-loader route can read them on serverless.
  outputFileTracingIncludes: {
    "/api/samples/[pack]": ["./samples/**"],
  },
};

export default nextConfig;
