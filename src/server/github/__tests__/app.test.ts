import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  env: {
    GITHUB_APP_ID: undefined as string | undefined,
    GITHUB_APP_PRIVATE_KEY: undefined as string | undefined,
  },
  request: vi.fn(),
  installations: [] as { id: number }[],
}));

vi.mock("@/env", () => ({ env: m.env }));
vi.mock("@octokit/app", () => ({
  App: class {
    eachInstallation = {
      async *iterator() {
        for (const installation of m.installations) {
          yield { installation, octokit: { request: m.request } };
        }
      },
    };
    constructor(_opts: unknown) {}
  },
}));

import { isGithubConfigured, listConnectableRepos } from "../app";

beforeEach(() => {
  vi.clearAllMocks();
  m.env.GITHUB_APP_ID = undefined;
  m.env.GITHUB_APP_PRIVATE_KEY = undefined;
  m.installations = [];
});

describe("Story 3.2 — GitHub App client", () => {
  it("isGithubConfigured is false unless BOTH the app id and private key are set", () => {
    expect(isGithubConfigured()).toBe(false);
    m.env.GITHUB_APP_ID = "3980977";
    expect(isGithubConfigured()).toBe(false); // key still missing
    m.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN-----\\n...\\n-----END-----";
    expect(isGithubConfigured()).toBe(true);
  });

  it("listConnectableRepos returns [] when unconfigured (no API call)", async () => {
    expect(await listConnectableRepos()).toEqual([]);
    expect(m.request).not.toHaveBeenCalled();
  });

  it("listConnectableRepos flattens installations→repos into the stringified shape", async () => {
    m.env.GITHUB_APP_ID = "3980977";
    m.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN-----\\nKEY\\n-----END-----";
    m.installations = [{ id: 555 }];
    m.request.mockResolvedValue({
      data: {
        repositories: [
          { id: 100, full_name: "cjjutba/soloist", private: false },
          { id: 101, full_name: "cjjutba/secret", private: true },
        ],
      },
    });

    const repos = await listConnectableRepos();
    expect(repos).toEqual([
      { installationId: "555", repoId: "100", fullName: "cjjutba/soloist", private: false },
      { installationId: "555", repoId: "101", fullName: "cjjutba/secret", private: true },
    ]);
    expect(m.request).toHaveBeenCalledWith("GET /installation/repositories", { per_page: 100, page: 1 });
  });
});
