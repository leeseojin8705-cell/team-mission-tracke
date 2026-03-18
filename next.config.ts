import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbo: {
      root: path.resolve(process.cwd()),
    },
  },
};

export default nextConfig;
