import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireClient: vi.fn(),
  requireFreelancer: vi.fn(),
  getEngagement: vi.fn(),
  createMessage: vi.fn(),
  markChatReadAsClient: vi.fn(),
  markChatReadAsFreelancer: vi.fn(),
  publishToEngagement: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({
  requireClient: m.requireClient,
  requireFreelancer: m.requireFreelancer,
}));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/messages.repository", () => ({
  createMessage: m.createMessage,
  markChatReadAsClient: m.markChatReadAsClient,
  markChatReadAsFreelancer: m.markChatReadAsFreelancer,
}));
vi.mock("@/server/realtime/publish", () => ({ publishToEngagement: m.publishToEngagement }));

import {
  markChatReadAsClientAction,
  markChatReadAsFreelancerAction,
  sendMessageAsClientAction,
  sendMessageAsFreelancerAction,
} from "../chat.actions";

const ENG = "11111111-1111-4111-8111-111111111111";
const clientCtx = { tenantId: "t1", userId: "cu", role: "client" as const, engagementId: ENG };
const freelancerCtx = { tenantId: "t1", userId: "fu", role: "freelancer" as const };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireClient.mockResolvedValue(clientCtx);
  m.requireFreelancer.mockResolvedValue(freelancerCtx);
  m.getEngagement.mockResolvedValue({ id: ENG });
  m.createMessage.mockResolvedValue({ id: "msg1" });
  m.markChatReadAsClient.mockResolvedValue(undefined);
  m.markChatReadAsFreelancer.mockResolvedValue(undefined);
  m.publishToEngagement.mockResolvedValue(undefined);
});

describe("sendMessageAsClientAction", () => {
  it("creates a client message in the SESSION's engagement (trimmed) + marks read + signals", async () => {
    const res = await sendMessageAsClientAction({ body: "  hello  " });
    expect(res).toEqual({ ok: true });
    expect(m.createMessage).toHaveBeenCalledWith(clientCtx, {
      engagementId: ENG,
      senderRole: "client",
      body: "hello",
    });
    expect(m.markChatReadAsClient).toHaveBeenCalledWith(clientCtx);
    expect(m.publishToEngagement).toHaveBeenCalledWith(ENG, "message");
  });

  it("rejects an empty body before any write", async () => {
    const res = await sendMessageAsClientAction({ body: "   " });
    expect(res.ok).toBe(false);
    expect(m.createMessage).not.toHaveBeenCalled();
    expect(m.publishToEngagement).not.toHaveBeenCalled();
  });

  it("rejects an over-long body", async () => {
    const res = await sendMessageAsClientAction({ body: "x".repeat(4001) });
    expect(res.ok).toBe(false);
    expect(m.createMessage).not.toHaveBeenCalled();
  });
});

describe("sendMessageAsFreelancerAction", () => {
  it("creates a freelancer message in the guarded engagement + marks read + signals", async () => {
    const res = await sendMessageAsFreelancerAction({ engagementId: ENG, body: "yo" });
    expect(res).toEqual({ ok: true });
    expect(m.getEngagement).toHaveBeenCalledWith(freelancerCtx, ENG);
    expect(m.createMessage).toHaveBeenCalledWith(freelancerCtx, {
      engagementId: ENG,
      senderRole: "freelancer",
      body: "yo",
    });
    expect(m.markChatReadAsFreelancer).toHaveBeenCalledWith(freelancerCtx, ENG);
    expect(m.publishToEngagement).toHaveBeenCalledWith(ENG, "message");
  });

  it("a foreign/missing engagement (getEngagement → null) is rejected, nothing written (the load-bearing guard)", async () => {
    m.getEngagement.mockResolvedValue(null);
    const res = await sendMessageAsFreelancerAction({ engagementId: ENG, body: "yo" });
    expect(res.ok).toBe(false);
    expect(m.createMessage).not.toHaveBeenCalled();
    expect(m.publishToEngagement).not.toHaveBeenCalled();
  });

  it("a non-uuid engagementId is rejected before the guard/write", async () => {
    const res = await sendMessageAsFreelancerAction({ engagementId: "nope", body: "yo" });
    expect(res.ok).toBe(false);
    expect(m.getEngagement).not.toHaveBeenCalled();
    expect(m.createMessage).not.toHaveBeenCalled();
  });
});

describe("mark-read actions", () => {
  it("client: advances the client cursor + signals `seen`", async () => {
    await markChatReadAsClientAction();
    expect(m.markChatReadAsClient).toHaveBeenCalledWith(clientCtx);
    expect(m.publishToEngagement).toHaveBeenCalledWith(ENG, "seen");
  });

  it("freelancer: guards the engagement, advances the cursor + signals `seen`", async () => {
    await markChatReadAsFreelancerAction(ENG);
    expect(m.getEngagement).toHaveBeenCalledWith(freelancerCtx, ENG);
    expect(m.markChatReadAsFreelancer).toHaveBeenCalledWith(freelancerCtx, ENG);
    expect(m.publishToEngagement).toHaveBeenCalledWith(ENG, "seen");
  });

  it("freelancer: a foreign engagement does NOT advance the cursor or signal", async () => {
    m.getEngagement.mockResolvedValue(null);
    await markChatReadAsFreelancerAction(ENG);
    expect(m.markChatReadAsFreelancer).not.toHaveBeenCalled();
    expect(m.publishToEngagement).not.toHaveBeenCalled();
  });

  it("freelancer: a non-uuid id no-ops before auth", async () => {
    await markChatReadAsFreelancerAction("nope");
    expect(m.requireFreelancer).not.toHaveBeenCalled();
    expect(m.markChatReadAsFreelancer).not.toHaveBeenCalled();
  });
});
