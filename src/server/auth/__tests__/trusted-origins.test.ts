import { describe, expect, it } from "vitest";
import { buildTrustedOrigins } from "../trusted-origins";

const BASE = "https://soloist.cjjutba.com";

// This locks OUR contract: prod stays tight (CSRF), dev also trusts any localhost port. Better
// Auth's own wildcard matcher turns `http://localhost:*` into a match for a floating Next port
// (3000/3001/3002…) — verified manually against its `matchesOriginPattern`; not re-tested here
// since that matcher is an internal, non-public export.
describe("buildTrustedOrigins", () => {
  it("production trusts ONLY the canonical origin (no localhost — CSRF stays tight)", () => {
    const origins = buildTrustedOrigins(BASE, "production");
    expect(origins).toEqual([BASE]);
    expect(origins.some((o) => o.includes("localhost"))).toBe(false);
    expect(origins.some((o) => o.includes("*"))).toBe(false);
  });

  it("development trusts the canonical origin AND any localhost / 127.0.0.1 port", () => {
    const origins = buildTrustedOrigins("http://localhost:3002", "development");
    expect(origins).toContain("http://localhost:3002"); // the configured base
    expect(origins).toContain("http://localhost:*"); // fixes the :3002-vs-:3000 403
    expect(origins).toContain("http://127.0.0.1:*");
  });

  it("a non-production NODE_ENV (e.g. test/undefined) is treated as dev — never as prod", () => {
    expect(buildTrustedOrigins(BASE, undefined)).toContain("http://localhost:*");
    expect(buildTrustedOrigins(BASE, "test")).toContain("http://localhost:*");
  });
});
