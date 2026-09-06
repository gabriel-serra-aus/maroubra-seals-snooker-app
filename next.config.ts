import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both database drivers load native/WASM resources at runtime and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
