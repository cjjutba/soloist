import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted stubs so the (hoisted) vi.mock factories can reference them. Stub error
// classes are shared between the test and sign-up.ts (both import them from the
// mocked module), so `instanceof` checks line up.
const m = vi.hoisted(() => {
  class SlugTakenError extends Error {}
  class AlreadyProvisionedError extends Error {}
  return {
    signUpEmail: vi.fn(),
    provisionTenant: vi.fn(),
    deleteUserById: vi.fn(),
    userExists: vi.fn(),
    SlugTakenError,
    AlreadyProvisionedError,
  };
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../index", () => ({ auth: { api: { signUpEmail: m.signUpEmail } } }));
vi.mock("@/server/db/repositories/tenants.repository", () => ({
  provisionTenant: m.provisionTenant,
  SlugTakenError: m.SlugTakenError,
  AlreadyProvisionedError: m.AlreadyProvisionedError,
}));
vi.mock("../users", () => ({ deleteUserById: m.deleteUserById, userExists: m.userExists }));

import { signUpFreelancer } from "../sign-up";

const valid = {
  name: "Casey Dev",
  email: "casey@example.com",
  password: "supersecret",
  slug: "casey-studio",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.signUpEmail.mockResolvedValue({ user: { id: "u1" } });
  m.userExists.mockResolvedValue(true); // real (persisted) user by default
  m.provisionTenant.mockResolvedValue({ id: "t1" });
});

describe("signUpFreelancer", () => {
  it("creates the user then provisions the Tenant (AC-1)", async () => {
    const res = await signUpFreelancer(valid);
    expect(res).toEqual({ ok: true });
    expect(m.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: "Casey Dev", email: "casey@example.com", password: "supersecret" },
      }),
    );
    expect(m.provisionTenant).toHaveBeenCalledWith({
      ownerUserId: "u1",
      slug: "casey-studio",
      name: "Casey Dev",
    });
    expect(m.deleteUserById).not.toHaveBeenCalled();
  });

  it("returns a generic success WITHOUT provisioning when the email is a duplicate (synthetic user, anti-enumeration)", async () => {
    m.userExists.mockResolvedValue(false); // Better Auth's synthetic, non-persisted user
    const res = await signUpFreelancer(valid);
    expect(res).toEqual({ ok: true });
    expect(m.provisionTenant).not.toHaveBeenCalled(); // no tenant for a non-existent user
  });

  it("rejects a reserved slug WITHOUT creating a user (AC-3)", async () => {
    const res = await signUpFreelancer({ ...valid, slug: "app" });
    expect(res).toEqual({ ok: false, fieldErrors: { slug: expect.stringMatching(/reserved/i) } });
    expect(m.signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid slug format WITHOUT creating a user (AC-3)", async () => {
    const res = await signUpFreelancer({ ...valid, slug: "ab" });
    expect(res).toMatchObject({ ok: false, fieldErrors: { slug: expect.any(String) } });
    expect(m.signUpEmail).not.toHaveBeenCalled();
  });

  it("validates the password length WITHOUT creating a user", async () => {
    const res = await signUpFreelancer({ ...valid, password: "short" });
    expect(res).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(m.signUpEmail).not.toHaveBeenCalled();
  });

  it("surfaces an unexpected signUpEmail failure as a neutral form error (not 'email in use')", async () => {
    m.signUpEmail.mockRejectedValue(new Error("infra down"));
    const res = await signUpFreelancer(valid);
    expect(res).toMatchObject({ ok: false, fieldErrors: { form: expect.any(String) } });
    expect(m.provisionTenant).not.toHaveBeenCalled();
  });

  it("on slug collision after sign-up, deletes the orphan user and returns a slug error (AC-3)", async () => {
    m.provisionTenant.mockRejectedValue(new m.SlugTakenError());
    const res = await signUpFreelancer(valid);
    expect(m.deleteUserById).toHaveBeenCalledWith("u1");
    expect(res).toMatchObject({ ok: false, fieldErrors: { slug: expect.stringMatching(/taken/i) } });
  });

  it("on owner-already-provisioned, deletes the orphan user and returns a form error", async () => {
    m.provisionTenant.mockRejectedValue(new m.AlreadyProvisionedError());
    const res = await signUpFreelancer(valid);
    expect(m.deleteUserById).toHaveBeenCalledWith("u1");
    expect(res).toMatchObject({ ok: false, fieldErrors: { form: expect.any(String) } });
  });

  it("on an UNKNOWN provisioning failure, cleans up and returns a form error WITHOUT throwing", async () => {
    m.provisionTenant.mockRejectedValue(new Error("fk violation"));
    const res = await signUpFreelancer(valid);
    expect(m.deleteUserById).toHaveBeenCalledWith("u1");
    expect(res).toMatchObject({ ok: false, fieldErrors: { form: expect.any(String) } });
  });
});
