import { describe, expect, it } from "vitest";
import { ADMIN_NAVIGATION_SECTIONS } from "./admin-navigation-config";

describe("Admin navigation is intentionally small and functional", () => {
  it("links to implemented destinations without placeholders or duplicates", () => {
    const entries = ADMIN_NAVIGATION_SECTIONS.flatMap(
      (section) => section.items,
    );
    const hrefs = entries.map((item) => item.href);
    expect(hrefs).toEqual([
      "/admin/map",
      "/admin/devices",
      "/admin/access-applications",
      "/admin/access-users",
      "/account/security",
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(entries.every((item) => item.label && item.icon && item.href)).toBe(
      true,
    );
    expect(entries.some((item) => /segera|coming soon/i.test(item.label))).toBe(
      false,
    );
  });

  it("keeps provisioning inside device management and does not promote Admin to field operator", () => {
    const entries = ADMIN_NAVIGATION_SECTIONS.flatMap(
      (section) => section.items,
    );
    expect(
      entries.filter((item) => item.href === "/admin/devices"),
    ).toHaveLength(1);
    expect(
      entries.every(
        (item) => !/^\/(operator|ranger|supervisor)\//.test(item.href),
      ),
    ).toBe(true);
  });
});
