import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-webhook-secret";
const m = vi.hoisted(() => ({
  env: { GITHUB_APP_WEBHOOK_SECRET: "test-webhook-secret" as string | undefined },
  recordDelivery: vi.fn(),
  deleteDelivery: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/env", () => ({ env: m.env }));
vi.mock("@/server/db/repositories/webhook-event.repository", () => ({
  recordDelivery: m.recordDelivery,
  deleteDelivery: m.deleteDelivery,
}));
vi.mock("@/server/inngest/client", () => ({ inngest: { send: m.send } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "../route";

const body = JSON.stringify({ repository: { full_name: "cj/x" }, ref: "refs/heads/main", after: "a", commits: [{}] });
const sign = (b: string, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

const makeReq = (opts: { body?: string; sig?: string | null; event?: string | null; delivery?: string | null }) => {
  const headers = new Headers();
  if (opts.sig !== null) headers.set("x-hub-signature-256", opts.sig ?? sign(opts.body ?? body));
  if (opts.event !== null) headers.set("x-github-event", opts.event ?? "push");
  if (opts.delivery !== null) headers.set("x-github-delivery", opts.delivery ?? "delivery-1");
  return new Request("https://soloist.test/api/webhooks/github", { method: "POST", headers, body: opts.body ?? body });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
  m.recordDelivery.mockResolvedValue(true);
  m.deleteDelivery.mockResolvedValue(undefined);
  m.send.mockResolvedValue(undefined);
});

describe("POST /api/webhooks/github (Story 3.1)", () => {
  it("a valid, new, signed delivery → records + enqueues + 202", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(202);
    expect(m.recordDelivery).toHaveBeenCalledWith({ ghDeliveryId: "delivery-1", eventType: "push" });
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "github/event.received", data: expect.objectContaining({ ghDeliveryId: "delivery-1", eventType: "push" }) }),
    );
  });

  it("an INVALID signature → 401, no record, no enqueue", async () => {
    const res = await POST(makeReq({ sig: "sha256=" + "0".repeat(64) }));
    expect(res.status).toBe(401);
    expect(m.recordDelivery).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("a wrong-secret signature → 401 (HMAC mismatch)", async () => {
    const res = await POST(makeReq({ sig: sign(body, "the-wrong-secret") }));
    expect(res.status).toBe(401);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("a DUPLICATE delivery (ledger says seen) → 202, no second enqueue", async () => {
    m.recordDelivery.mockResolvedValue(false);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(202);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("an enqueue failure rolls back the ledger row and returns 500 (no permanent drop)", async () => {
    m.send.mockRejectedValueOnce(new Error("inngest unreachable"));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(500);
    expect(m.recordDelivery).toHaveBeenCalledTimes(1);
    expect(m.deleteDelivery).toHaveBeenCalledWith("delivery-1"); // compensating rollback
  });

  it("a malformed (but signed) JSON body → 400, no record, no enqueue", async () => {
    const bad = "}{not json";
    const res = await POST(makeReq({ body: bad, sig: sign(bad) }));
    expect(res.status).toBe(400);
    expect(m.recordDelivery).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("missing signature header → 400", async () => {
    const res = await POST(makeReq({ sig: null }));
    expect(res.status).toBe(400);
  });

  it("no webhook secret configured → 503 (fail closed)", async () => {
    m.env.GITHUB_APP_WEBHOOK_SECRET = undefined;
    const res = await POST(makeReq({}));
    expect(res.status).toBe(503);
    expect(m.recordDelivery).not.toHaveBeenCalled();
  });
});
