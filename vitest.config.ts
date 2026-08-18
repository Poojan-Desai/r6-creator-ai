import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Migration and media-process tests are intentionally integration-heavy.
    // Bound parallelism so a clean laptop run does not starve SQLite/child
    // processes and turn valid safety timeouts into machine-load failures.
    maxWorkers: 4,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
