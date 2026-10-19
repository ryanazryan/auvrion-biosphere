import { describe, expect, it } from "vitest";
import {
  isLifecycleAction,
  isLifecycleReason,
  planLifecycleTransition,
} from "./policy";

describe("access lifecycle policy", () => {
  it("only recognizes narrow lifecycle actions and meaningful reasons", () => {
    expect(isLifecycleAction("set_role")).toBe(true);
    expect(isLifecycleAction("disable_account")).toBe(true);
    expect(isLifecycleAction("grant_admin")).toBe(false);
    expect(isLifecycleReason("Kebutuhan tugas berubah")).toBe(true);
    expect(isLifecycleReason("short")).toBe(false);
    expect(isLifecycleReason(" ".repeat(20))).toBe(false);
    expect(isLifecycleReason("a".repeat(501))).toBe(false);
  });

  it("grants and changes an exclusive operational role", () => {
    expect(
      planLifecycleTransition({
        action: "set_role",
        requestedRole: "ranger",
        accessStatus: "active",
        activeRoles: [],
      }),
    ).toMatchObject({
      ok: true,
      auditAction: "role_granted",
      nextRole: "ranger",
    });
    expect(
      planLifecycleTransition({
        action: "set_role",
        requestedRole: "operator",
        accessStatus: "active",
        activeRoles: ["ranger"],
      }),
    ).toMatchObject({
      ok: true,
      auditAction: "role_changed",
      revokeExisting: true,
    });
  });

  it("rejects unchanged, invalid, or ambiguous role changes", () => {
    for (const [role, activeRoles, code] of [
      ["ranger", ["ranger"], "ROLE_UNCHANGED"],
      ["admin", ["ranger"], "INVALID_ROLE"],
      [
        "ranger",
        ["ranger", "operator"],
        "MULTIPLE_ACTIVE_ROLES_REVIEW_REQUIRED",
      ],
    ] as const) {
      expect(
        planLifecycleTransition({
          action: "set_role",
          requestedRole: role,
          accessStatus: "active",
          activeRoles,
        }),
      ).toEqual({ ok: false, code });
    }
  });

  it("revoke is fail-closed and disabled accounts cannot be changed", () => {
    expect(
      planLifecycleTransition({
        action: "revoke_role",
        requestedRole: undefined,
        accessStatus: "active",
        activeRoles: [],
      }),
    ).toEqual({ ok: false, code: "NO_ACTIVE_ROLE" });
    expect(
      planLifecycleTransition({
        action: "revoke_role",
        requestedRole: undefined,
        accessStatus: "active",
        activeRoles: ["ranger"],
      }),
    ).toMatchObject({ ok: true, auditAction: "role_revoked", nextRole: null });
    expect(
      planLifecycleTransition({
        action: "disable_account",
        requestedRole: undefined,
        accessStatus: "active",
        activeRoles: [],
      }),
    ).toMatchObject({
      ok: true,
      auditAction: "account_disabled",
      disableAccount: true,
    });
    expect(
      planLifecycleTransition({
        action: "disable_account",
        requestedRole: undefined,
        accessStatus: "active",
        activeRoles: ["ranger", "supervisor"],
      }),
    ).toMatchObject({ ok: true, auditAction: "account_disabled" });
    expect(
      planLifecycleTransition({
        action: "set_role",
        requestedRole: "ranger",
        accessStatus: "disabled",
        activeRoles: [],
      }),
    ).toEqual({ ok: false, code: "ACCOUNT_DISABLED" });
  });
});
