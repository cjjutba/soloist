import { describe, expect, it } from "vitest";
import {
  isValidSlugFormat,
  normalizeSlug,
  RESERVED_SLUGS,
  validateSlug,
} from "@/lib/slug";

describe("normalizeSlug", () => {
  it("trims and lowercases", () => {
    expect(normalizeSlug("  My-Studio ")).toBe("my-studio");
    expect(normalizeSlug("ABCdef")).toBe("abcdef");
  });
  it("does NOT convert spaces to hyphens (spaces become an invalid slug)", () => {
    expect(normalizeSlug("My Studio")).toBe("my studio");
  });
});

describe("isValidSlugFormat (strict, raw)", () => {
  it.each(["abc", "my-studio", "a-b-c", "a1b2", "x".repeat(3), "x".repeat(63)])(
    "accepts %s",
    (s) => expect(isValidSlugFormat(s)).toBe(true),
  );

  it.each([
    ["", "empty"],
    ["ab", "too short (2)"],
    ["x".repeat(64), "too long (64)"],
    ["MyStudio", "uppercase"],
    ["-abc", "leading hyphen"],
    ["abc-", "trailing hyphen"],
    ["a--b", "double hyphen"],
    ["ab_c", "underscore"],
    ["ab c", "space"],
    ["abc!", "illegal char"],
  ])("rejects %s (%s)", (s) => expect(isValidSlugFormat(s)).toBe(false));
});

describe("RESERVED_SLUGS", () => {
  it.each(["app", "portal", "invite", "api", "auth", "admin", "soloist", "login"])(
    "reserves %s",
    (s) => expect(RESERVED_SLUGS.has(s)).toBe(true),
  );
});

describe("validateSlug (normalize → format → reserved)", () => {
  it("accepts and returns the normalized slug", () => {
    expect(validateSlug("my-studio")).toEqual({ ok: true, slug: "my-studio" });
    expect(validateSlug("  My-Studio ")).toEqual({ ok: true, slug: "my-studio" });
    expect(validateSlug("ABCdef")).toEqual({ ok: true, slug: "abcdef" });
  });

  it.each(["ab", "-abc", "abc-", "a--b", "ab_c", "ab c"])(
    "rejects %s as a format error",
    (s) => expect(validateSlug(s)).toEqual({ ok: false, reason: "format" }),
  );

  it.each(["app", "API", "Portal", "invite"])(
    "rejects reserved %s (after normalization)",
    (s) => expect(validateSlug(s)).toEqual({ ok: false, reason: "reserved" }),
  );
});
