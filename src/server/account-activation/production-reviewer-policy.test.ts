import { describe, expect, it } from "vitest";
import {
  isProductionReviewerInvitation,
  PRODUCTION_REVIEWER_INVITE_DECISION,
} from "./production-reviewer-policy";

const valid = {
  environment: "production",
  configuredOwnerEmail: "owner@example.com",
  inviterEmail: "owner@example.com",
  issuerId: "owner-id",
  reviewerId: "owner-id",
  decisionReason: PRODUCTION_REVIEWER_INVITE_DECISION,
  hasReviewApplications: true,
  hasManageAccess: true,
};

describe("production demo reviewer invitation provenance", () => {
  it("accepts owner-issued reviewer with both capabilities", () => {
    expect(isProductionReviewerInvitation(valid)).toBe(true);
  });
  it("rejects wrong inviter", () => {
    expect(
      isProductionReviewerInvitation({
        ...valid,
        inviterEmail: "attacker@example.com",
      }),
    ).toBe(false);
  });
  it("rejects different reviewer", () => {
    expect(
      isProductionReviewerInvitation({ ...valid, reviewerId: "another-id" }),
    ).toBe(false);
  });
  it("rejects wrong decision", () => {
    expect(
      isProductionReviewerInvitation({ ...valid, decisionReason: "approved" }),
    ).toBe(false);
  });
  it("rejects missing manage_access", () => {
    expect(
      isProductionReviewerInvitation({ ...valid, hasManageAccess: false }),
    ).toBe(false);
  });
  it("rejects missing review_applications", () => {
    expect(
      isProductionReviewerInvitation({
        ...valid,
        hasReviewApplications: false,
      }),
    ).toBe(false);
  });
  it("rejects development, including dev admin identity", () => {
    expect(
      isProductionReviewerInvitation({ ...valid, environment: "development" }),
    ).toBe(false);
    expect(
      isProductionReviewerInvitation({
        ...valid,
        configuredOwnerEmail: "dev-admin@example.test",
        inviterEmail: "dev-admin@example.test",
      }),
    ).toBe(false);
  });
});
