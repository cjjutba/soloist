import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Story 1.1 (path-based skeleton) has no pure logic to unit-test; tests
    // resume with the data layer (Story 1.2) and the auth guard (Story 1.4).
    passWithNoTests: true,
  },
});
