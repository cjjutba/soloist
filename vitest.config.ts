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
    // RLS semantics, no docker). ~10 such files replay migrations; the setup is ~3s normally but on a
    // shared/loaded dev box (multiple concurrent sessions) a cold replay can balloon. This is a
    // setup-budget ceiling ONLY — a genuinely broken beforeAll throws immediately, so the headroom
    // tolerates CPU contention without masking a real failure (assertions/test logic unaffected).
    hookTimeout: 60_000,
  },
});
