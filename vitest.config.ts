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
    // The PGlite isolation/repository suites apply EVERY committed migration in `beforeAll` (real
    // RLS semantics, no docker). With ~10 such files running in parallel, a cold migration replay
    // can exceed Vitest's 10s default under load — a setup-budget ceiling, not slow logic. 30s gives
    // headroom so the suite is reliably green (assertions/timeouts of the tests themselves unaffected).
    hookTimeout: 30_000,
  },
});
