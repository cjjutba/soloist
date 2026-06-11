import { describe, expect, it } from "vitest";
import { engagementChannel, userChannel } from "@/lib/realtime-channels";
import { buildCapability } from "../channels";

const ENG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("realtime channel names", () => {
  it("namespaces by id", () => {
    expect(engagementChannel(ENG_A)).toBe(`engagement:${ENG_A}`);
    expect(userChannel("u1")).toBe("user:u1");
  });
});

describe("buildCapability — the wire-access boundary", () => {
  it("a client gets ONLY their user channel + their one engagement (subscribe/presence, never publish)", () => {
    const cap = buildCapability({ userId: "u1", engagementIds: [ENG_A] });
    expect(cap).toEqual({
      [userChannel("u1")]: ["subscribe"],
      [engagementChannel(ENG_A)]: ["subscribe", "presence"],
    });
    // No other engagement, and never publish (server-only).
    expect(cap[engagementChannel(ENG_B)]).toBeUndefined();
    expect(Object.values(cap).flat()).not.toContain("publish");
  });

  it("a freelancer gets their user channel + each of their engagements — and nothing else", () => {
    const cap = buildCapability({ userId: "f1", engagementIds: [ENG_A, ENG_B] });
    expect(Object.keys(cap).sort()).toEqual(
      [userChannel("f1"), engagementChannel(ENG_A), engagementChannel(ENG_B)].sort(),
    );
    expect(Object.values(cap).flat()).not.toContain("publish");
  });

  it("with no engagements, only the user channel is granted", () => {
    expect(buildCapability({ userId: "u1", engagementIds: [] })).toEqual({
      [userChannel("u1")]: ["subscribe"],
    });
  });
});
