import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getAblyRest: vi.fn(), publish: vi.fn(), get: vi.fn() }));
vi.mock("../ably", () => ({ getAblyRest: m.getAblyRest }));

import { publishToEngagement, publishToUser } from "../publish";

beforeEach(() => {
  vi.clearAllMocks();
  m.publish.mockResolvedValue(undefined);
  m.get.mockReturnValue({ publish: m.publish });
  m.getAblyRest.mockReturnValue({ channels: { get: m.get } });
});

describe("realtime publish — best-effort signals", () => {
  it("publishToEngagement → publishes the event to the engagement channel", async () => {
    await publishToEngagement("e1", "ship.published");
    expect(m.get).toHaveBeenCalledWith("engagement:e1");
    expect(m.publish).toHaveBeenCalledWith("ship.published", {});
  });

  it("publishToUser → publishes to the user channel", async () => {
    await publishToUser("u1", "notification");
    expect(m.get).toHaveBeenCalledWith("user:u1");
    expect(m.publish).toHaveBeenCalledWith("notification", {});
  });

  it("no-ops (no throw, no channel touched) when Ably is unconfigured", async () => {
    m.getAblyRest.mockReturnValue(null);
    await expect(publishToEngagement("e1", "x")).resolves.toBeUndefined();
    expect(m.get).not.toHaveBeenCalled();
  });

  it("swallows a publish failure — a broken realtime layer must never break the calling action", async () => {
    m.publish.mockRejectedValue(new Error("ably down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(publishToUser("u1", "x")).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
