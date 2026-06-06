import { describe, expect, it } from "vitest";
import { isUuid } from "../uuid";

describe("isUuid", () => {
  it("accepts canonical uuids (any version, either case)", () => {
    expect(isUuid("018f8b3e-1c2a-7e3b-9c4d-5e6f7a8b9c0d")).toBe(true);
    expect(isUuid("018F8B3E-1C2A-7E3B-9C4D-5E6F7A8B9C0D")).toBe(true);
  });

  it("rejects non-uuids that would otherwise hit a ::uuid cast 500", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("018f8b3e1c2a7e3b9c4d5e6f7a8b9c0d")).toBe(false); // no dashes
    expect(isUuid("018f8b3e-1c2a-7e3b-9c4d-5e6f7a8b9c0d-extra")).toBe(false);
  });
});
