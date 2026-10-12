import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Services import `server-only`, which throws outside Next's react-server condition.
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**"],
    // Integration suites seed a real SQLite database per file.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
