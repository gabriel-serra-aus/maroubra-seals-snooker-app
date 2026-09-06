import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test", PGLITE_DATA_DIR: "memory://", ADMIN_CODES: "Gabriel:testcode12345,Steve:othercode6789" },
  },
});
