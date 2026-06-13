import { describe, expect, it } from "vitest";
import { activeHref, crumbsForPath, NAV_GROUPS, FOOTER_ITEMS } from "../nav-config";

describe("nav-config structure", () => {
  it("has the 12 destinations in 3 groups + 2 footer items", () => {
    const items = NAV_GROUPS.flatMap((g) => g.items);
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(["Workspace", "Delivery", "Documents"]);
    expect(items).toHaveLength(10);
    expect(FOOTER_ITEMS).toHaveLength(2);
    expect([...items, ...FOOTER_ITEMS].map((i) => i.href)).toEqual([
      "/app", "/app/engagements", "/app/clients", "/app/messages",
      "/app/timeline", "/app/tasks", "/app/deliverables", "/app/approvals",
      "/app/files", "/app/invoices",
      "/app/settings/branding", "/app/settings",
    ]);
  });
});

describe("activeHref — longest-prefix match", () => {
  it("matches Overview only on the exact /app path", () => {
    expect(activeHref("/app")).toBe("/app");
    expect(activeHref("/app/engagements")).toBe("/app/engagements");
  });
  it("matches Engagements for any engagement child route", () => {
    expect(activeHref("/app/engagements/abc-123")).toBe("/app/engagements");
    expect(activeHref("/app/engagements/abc-123/documents")).toBe("/app/engagements");
  });
  it("disambiguates Brand vs Settings by longest prefix", () => {
    expect(activeHref("/app/settings/branding")).toBe("/app/settings/branding");
    expect(activeHref("/app/settings/account")).toBe("/app/settings");
    expect(activeHref("/app/settings")).toBe("/app/settings");
  });
  it("returns null for an unknown path", () => {
    expect(activeHref("/portal")).toBeNull();
  });
});

describe("crumbsForPath", () => {
  it("returns Overview for /app", () => {
    expect(crumbsForPath("/app")).toEqual([{ label: "Overview" }]);
  });
  it("builds linked crumbs with the last as the page", () => {
    expect(crumbsForPath("/app/settings/account")).toEqual([
      { label: "Settings", href: "/app/settings" },
      { label: "Account" },
    ]);
  });
  it("labels a uuid engagement segment as Engagement", () => {
    expect(crumbsForPath("/app/engagements/0190a1b2-c3d4-7000-8000-000000000000")).toEqual([
      { label: "Engagements", href: "/app/engagements" },
      { label: "Engagement" },
    ]);
  });
  it("labels a uuid under /documents as Invoice (disambiguated by parent), not Engagement", () => {
    const eng = "0190a1b2-c3d4-7000-8000-000000000000";
    const inv = "0190a1b2-c3d4-7000-8000-000000000001";
    expect(crumbsForPath(`/app/engagements/${eng}/documents/${inv}`)).toEqual([
      { label: "Engagements", href: "/app/engagements" },
      { label: "Engagement", href: `/app/engagements/${eng}` },
      { label: "Documents", href: `/app/engagements/${eng}/documents` },
      { label: "Invoice" },
    ]);
  });
});
