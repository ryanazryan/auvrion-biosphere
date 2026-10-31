import { describe, expect, it } from "vitest";
import {
  isVerifiedProductionBootstrapAdmin,
  PRODUCTION_BOOTSTRAP_DECISION,
} from "./bootstrap-admin-policy";

const valid = {
  userId: "owner-user-id",
  email: "owner@example.com",
  applicationEmail: "owner@example.com",
  reviewerId: "owner-user-id",
  decisionReason: PRODUCTION_BOOTSTRAP_DECISION,
  hasReviewApplications: true,
  hasManageAccess: true,
  environment: "production",
  configuredOwnerEmail: "owner@example.com",
};

describe("production admin bootstrap provenance", () => {
  it("accepts complete owner bootstrap provenance", () => {
    expect(isVerifiedProductionBootstrapAdmin(valid)).toBe(true);
  });

  it("rejects development environment", () => {
    expect(
      isVerifiedProductionBootstrapAdmin({
        ...valid,
        environment: "development",
      }),
    ).toBe(false);
  });

  it("rejects an unconfigured owner", () => {
    expect(
      isVerifiedProductionBootstrapAdmin({
        ...valid,
        configuredOwnerEmail: undefined,
      }),
    ).toBe(false);
  });

  it("rejects an unexpected identity", () => {
    expect(
      isVerifiedProductionBootstrapAdmin({
        ...valid,
        email: "attacker@example.com",
      }),
    ).toBe(false);
  });

  it("rejects an incorrect reviewer", () => {
    expect(
      isVerifiedProductionBootstrapAdmin({
        ...valid,
        reviewerId: "different-user",
      }),
    ).toBe(false);
  });

  it("rejects an incorrect bootstrap decision", () => {
    expect(
      isVerifiedProductionBootstrapAdmin({
        ...valid,
        decisionReason: "ordinary approval",
      }),
    ).toBe(false);
  });

  it("rejects missing capabilities", () => {
    expect(
      isVerifiedProductionBootstrapAdmin({
        ...valid,
        hasManageAccess: false,
      }),
    ).toBe(false);
  });
});
