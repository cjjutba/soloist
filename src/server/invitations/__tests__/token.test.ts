import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInviteToken, hashToken } from "../token";

describe("invite token", () => {
  it("hashToken is deterministic and matches the SHA-256 of the input", () => {
    const known = createHash("sha256").update("hello").digest("hex");
    expect(hashToken("hello")).toBe(known);
    expect(hashToken("hello")).toBe(hashToken("hello"));
  });

  it("hashToken returns 64 hex chars", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateInviteToken returns distinct, URL-safe tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url — safe in a path, no % needed
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("different tokens hash differently", () => {
    expect(hashToken(generateInviteToken())).not.toBe(hashToken(generateInviteToken()));
  });
});
