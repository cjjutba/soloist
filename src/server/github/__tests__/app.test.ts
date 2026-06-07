import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  env: {
    GITHUB_APP_ID: undefined as string | undefined,
    GITHUB_APP_PRIVATE_KEY: undefined as string | undefined,
    GITHUB_APP_CLIENT_ID: undefined as string | undefined,
    GITHUB_APP_CLIENT_SECRET: undefined as string | undefined,
  },
  request: vi.fn(),
  userRequest: vi.fn(),
}));

vi.mock("@/env", () => ({ env: m.env }));
vi.mock("@octokit/app", () => ({
  App: class {
    constructor(_opts: unknown) {}
    getInstallationOctokit = async (_id: number) => ({ request: m.request });
    oauth = { getUserOctokit: async (_opts: unknown) => ({ request: m.userRequest }) };
  },
}));

import {
  getUserInstallations,
  isGithubConfigured,
  isOauthConfigured,
  listReposForInstallations,
  pullRecentActivity,
} from "../app";

beforeEach(() => {
  vi.clearAllMocks();
  m.env.GITHUB_APP_ID = undefined;
  m.env.GITHUB_APP_PRIVATE_KEY = undefined;
  m.env.GITHUB_APP_CLIENT_ID = undefined;
  m.env.GITHUB_APP_CLIENT_SECRET = undefined;
});

const configureApp = () => {
  m.env.GITHUB_APP_ID = "3980977";
  m.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN-----\\nKEY\\n-----END-----";
};
const configureOauth = () => {
  m.env.GITHUB_APP_CLIENT_ID = "Iv1.abc";
  m.env.GITHUB_APP_CLIENT_SECRET = "secret";
};

describe("Story 3.2.1 — GitHub App client (scoped listing + OAuth verification)", () => {
  it("isGithubConfigured / isOauthConfigured gate on the right env", () => {
    expect(isGithubConfigured()).toBe(false);
    expect(isOauthConfigured()).toBe(false);
    configureApp();
    expect(isGithubConfigured()).toBe(true);
    expect(isOauthConfigured()).toBe(false);
    configureOauth();
    expect(isOauthConfigured()).toBe(true);
  });

  it("listReposForInstallations([]) returns [] without an API call (the fix: never all installations)", async () => {
    configureApp();
    expect(await listReposForInstallations([])).toEqual([]);
    expect(m.request).not.toHaveBeenCalled();
  });

  it("listReposForInstallations scopes to the given installation ids", async () => {
    configureApp();
    m.request.mockResolvedValue({
      data: { repositories: [{ id: 100, full_name: "cjjutba/soloist", private: false }] },
    });
    const repos = await listReposForInstallations(["555"]);
    expect(repos).toEqual([
      { installationId: "555", repoId: "100", fullName: "cjjutba/soloist", private: false },
    ]);
    expect(m.request).toHaveBeenCalledWith("GET /installation/repositories", { per_page: 100, page: 1 });
  });

  it("getUserInstallations returns the OAuth user's installations (the ownership source of truth)", async () => {
    configureApp();
    configureOauth();
    m.userRequest.mockResolvedValue({
      data: {
        installations: [
          { id: 555, account: { login: "cjjutba" } },
          { id: 556, account: null },
        ],
      },
    });
    const got = await getUserInstallations("code123");
    expect(got).toEqual([
      { id: "555", accountLogin: "cjjutba" },
      { id: "556", accountLogin: null },
    ]);
    expect(m.userRequest).toHaveBeenCalledWith("GET /user/installations", { per_page: 100 });
  });

  it("getUserInstallations returns [] when OAuth isn't configured (no verification possible)", async () => {
    configureApp();
    expect(await getUserInstallations("code")).toEqual([]);
    expect(m.userRequest).not.toHaveBeenCalled();
  });

  it("pullRecentActivity assembles head commit + merged/open PRs + published releases", async () => {
    configureApp();
    m.request.mockImplementation((route: string) => {
      if (route === "GET /repos/{owner}/{repo}") return Promise.resolve({ data: { default_branch: "main" } });
      if (route === "GET /repos/{owner}/{repo}/commits")
        return Promise.resolve({ data: [{ sha: "abc", commit: { message: "Ship" } }] });
      if (route === "GET /repos/{owner}/{repo}/pulls")
        return Promise.resolve({
          data: [
            { number: 7, title: "Merged", merged_at: "2026-01-01", state: "closed", draft: false, head: { ref: "b1", sha: "s1" } },
            { number: 8, title: "Open", merged_at: null, state: "open", draft: false, head: { ref: "b2", sha: "s2" } },
            { number: 9, title: "Draft", merged_at: null, state: "open", draft: true, head: { ref: "b3", sha: "s3" } },
          ],
        });
      if (route === "GET /repos/{owner}/{repo}/releases")
        return Promise.resolve({
          data: [
            { tag_name: "v1", name: "One", draft: false },
            { tag_name: "v2", name: null, draft: true },
          ],
        });
      return Promise.resolve({ data: {} });
    });

    const a = await pullRecentActivity("555", "cj/soloist");
    expect(a.headCommit).toEqual({ sha: "abc", message: "Ship", branch: "main" });
    expect(a.pulls.map((p) => p.number)).toEqual([7, 8]); // draft PR dropped
    expect(a.pulls[0]).toMatchObject({ merged: true, branch: "b1", headSha: "s1" });
    expect(a.releases.map((r) => r.tag)).toEqual(["v1"]); // draft release dropped
  });

  it("pullRecentActivity returns empty when the app is unconfigured / id non-numeric", async () => {
    expect(await pullRecentActivity("555", "cj/x")).toEqual({ pulls: [], releases: [] });
    expect(m.request).not.toHaveBeenCalled();
    configureApp();
    expect(await pullRecentActivity("not-a-number", "cj/x")).toEqual({ pulls: [], releases: [] });
  });
});
