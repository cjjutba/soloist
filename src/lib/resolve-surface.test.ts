import { describe, it, expect } from "vitest";
import { resolveSurface } from "./resolve-surface";

const ROOT = "cjjutba.com";
const COCKPIT = "soloist";

describe("resolveSurface — production hosts", () => {
  it("routes the cockpit subdomain to the cockpit", () => {
    expect(resolveSurface("soloist.cjjutba.com", ROOT, COCKPIT)).toEqual({
      surface: "cockpit",
    });
  });

  it("routes a tenant subdomain to the portal, carrying the slug", () => {
    expect(resolveSurface("cj.cjjutba.com", ROOT, COCKPIT)).toEqual({
      surface: "portal",
      slug: "cj",
    });
  });

  it("strips the port before deciding", () => {
    expect(resolveSurface("cj.cjjutba.com:443", ROOT, COCKPIT)).toEqual({
      surface: "portal",
      slug: "cj",
    });
  });

  it("routes the apex to not-found (no existence disclosure — NFR-2)", () => {
    expect(resolveSurface("cjjutba.com", ROOT, COCKPIT).surface).toBe("not-found");
  });

  it("routes www to not-found", () => {
    expect(resolveSurface("www.cjjutba.com", ROOT, COCKPIT).surface).toBe("not-found");
  });

  it("routes an unrelated domain to not-found", () => {
    expect(resolveSurface("evil.example.com", ROOT, COCKPIT).surface).toBe("not-found");
  });

  it("returns not-found for an empty or missing host", () => {
    expect(resolveSurface(null, ROOT, COCKPIT).surface).toBe("not-found");
    expect(resolveSurface(undefined, ROOT, COCKPIT).surface).toBe("not-found");
    expect(resolveSurface("", ROOT, COCKPIT).surface).toBe("not-found");
  });

  it("is case-insensitive", () => {
    expect(resolveSurface("CJ.Cjjutba.Com", ROOT, COCKPIT)).toEqual({
      surface: "portal",
      slug: "cj",
    });
  });
});

describe("resolveSurface — dev & preview hosts", () => {
  it("routes *.localhost in dev (rootDomain=localhost)", () => {
    expect(resolveSurface("soloist.localhost:3000", "localhost", COCKPIT)).toEqual({
      surface: "cockpit",
    });
    expect(resolveSurface("cj.localhost:3000", "localhost", COCKPIT)).toEqual({
      surface: "portal",
      slug: "cj",
    });
  });

  it("routes bare localhost (apex) to not-found", () => {
    expect(resolveSurface("localhost:3000", "localhost", COCKPIT).surface).toBe(
      "not-found",
    );
  });

  it("routes Vercel preview hosts to the cockpit", () => {
    expect(resolveSurface("soloist-git-main-cj.vercel.app", ROOT, COCKPIT)).toEqual({
      surface: "cockpit",
    });
  });
});

describe("resolveSurface — edge-case hosts", () => {
  it("normalizes a trailing-dot FQDN (cj.cjjutba.com.) to the portal", () => {
    expect(resolveSurface("cj.cjjutba.com.", ROOT, COCKPIT)).toEqual({
      surface: "portal",
      slug: "cj",
    });
  });

  it("routes a multi-level subdomain to not-found (slugs are single-label)", () => {
    expect(resolveSurface("a.b.cjjutba.com", ROOT, COCKPIT).surface).toBe("not-found");
    expect(resolveSurface("www.acme.cjjutba.com", ROOT, COCKPIT).surface).toBe(
      "not-found",
    );
  });
});
