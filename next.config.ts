import type { NextConfig } from "next";

/** 상위 폴더에 다른 lockfile이 있을 때 Turbopack이 잘못된 루트를 고르지 않도록 고정 */
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
