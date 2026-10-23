import { describe, expect, it } from "vitest";
import { getRoleHomeCandidates, ROLE_HOME } from "./role-home";

describe("role-based home navigation", () => {
  it("maps approved operational roles to workspace routes", () => {
    expect(ROLE_HOME).toEqual({
      supervisor: "/supervisor/overview",
      operator: "/operator/overview",
      ranger: "/ranger",
    });
  });

  it("prioritizes supervisor, operator, then ranger", () => {
    expect(
      getRoleHomeCandidates([
        { role: "ranger", organizationId: "org-r" },
        { role: "operator", organizationId: "org-o" },
        { role: "supervisor", organizationId: "org-s" },
      ]),
    ).toEqual([
      {
        role: "supervisor",
        organizationId: "org-s",
        href: "/supervisor/overview",
      },
      {
        role: "operator",
        organizationId: "org-o",
        href: "/operator/overview",
      },
      {
        role: "ranger",
        organizationId: "org-r",
        href: "/ranger",
      },
    ]);
  });

  it("ignores unsupported roles", () => {
    expect(
      getRoleHomeCandidates([{ role: "unknown", organizationId: "org-a" }]),
    ).toEqual([]);
  });

  it("returns no candidates when grants are absent", () => {
    expect(getRoleHomeCandidates([])).toEqual([]);
  });
});
