import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireFreelancer: vi.fn(),
  upsertBranding: vi.fn(),
  put: vi.fn(),
  env: { BLOB_READ_WRITE_TOKEN: "test-token" as string | undefined },
}));

vi.mock("@/env", () => ({ env: m.env }));
vi.mock("@vercel/blob", () => ({ put: m.put }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireFreelancer: m.requireFreelancer }));
vi.mock("@/server/db/repositories/branding.repository", () => ({ upsertBranding: m.upsertBranding }));

import { saveAccent, uploadLogo } from "../branding.actions";

const CTX = { tenantId: "t1", userId: "u1", role: "freelancer" as const };
const fd = (file: File) => {
  const f = new FormData();
  f.append("logo", file);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireFreelancer.mockResolvedValue(CTX);
  m.upsertBranding.mockResolvedValue({});
  m.put.mockResolvedValue({ url: "https://blob/logo.png" });
  m.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("saveAccent (server-authoritative contrast guard)", () => {
  it("saves a legible accent + the derived text token (AC-2)", async () => {
    const r = await saveAccent({ accentHex: "#5B5BD6" });
    expect(r).toEqual({
      ok: true,
      accentHex: "#5B5BD6",
      accentTextHex: "#5B5BD6",
      focusRingFallback: false,
    });
    expect(m.upsertBranding).toHaveBeenCalledWith(CTX, {
      accentHex: "#5B5BD6",
      accentTextHex: "#5B5BD6",
    });
  });

  it("blocks a too-light accent with a suggestion and does NOT save (AC-2)", async () => {
    const r = await saveAccent({ accentHex: "#FFD700" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.suggestion).toMatch(/^#[0-9A-F]{6}$/);
      expect(r.error).toMatch(/4\.5/);
    }
    expect(m.upsertBranding).not.toHaveBeenCalled();
  });

  it("rejects an invalid hex without saving", async () => {
    const r = await saveAccent({ accentHex: "not-a-color" });
    expect(r.ok).toBe(false);
    expect(m.upsertBranding).not.toHaveBeenCalled();
  });

  it("returns a neutral error (no throw) if the repository fails", async () => {
    m.upsertBranding.mockRejectedValue(new Error("db down"));
    const r = await saveAccent({ accentHex: "#0F766E" });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("uploadLogo (validation is the only guard on public blob uploads)", () => {
  it("uploads a valid logo to Blob and saves its URL", async () => {
    const r = await uploadLogo(fd(new File(["x"], "logo.png", { type: "image/png" })));
    expect(r).toEqual({ ok: true, url: "https://blob/logo.png" });
    expect(m.put).toHaveBeenCalled();
    expect(m.upsertBranding).toHaveBeenCalledWith(CTX, { logoBlobUrl: "https://blob/logo.png" });
  });

  it("rejects SVG (active-content XSS) without uploading", async () => {
    const r = await uploadLogo(fd(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })));
    expect(r.ok).toBe(false);
    expect(m.put).not.toHaveBeenCalled();
  });

  it("rejects a non-allowed mime without uploading", async () => {
    const r = await uploadLogo(fd(new File(["x"], "x.gif", { type: "image/gif" })));
    expect(r.ok).toBe(false);
    expect(m.put).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 1MB without uploading", async () => {
    const big = new File([new Uint8Array(1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const r = await uploadLogo(fd(big));
    expect(r.ok).toBe(false);
    expect(m.put).not.toHaveBeenCalled();
  });

  it("rejects an empty/missing file", async () => {
    const r = await uploadLogo(fd(new File([], "e.png", { type: "image/png" })));
    expect(r.ok).toBe(false);
    expect(m.put).not.toHaveBeenCalled();
  });

  it("fails CLOSED (no upload) when the Blob token is missing", async () => {
    m.env.BLOB_READ_WRITE_TOKEN = undefined;
    const r = await uploadLogo(fd(new File(["x"], "logo.png", { type: "image/png" })));
    expect(r.ok).toBe(false);
    expect(m.put).not.toHaveBeenCalled();
  });
});
