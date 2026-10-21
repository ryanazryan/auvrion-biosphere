import { describe, expect, it } from "vitest";
import {
  isVerifiedLocalBootstrapAdmin,
  LOCAL_BOOTSTRAP_DECISION,
} from "./bootstrap-admin-policy";

const valid = {
  userId: "bootstrap-id",
  email: "dev-admin@example.test",
  applicationEmail: "dev-admin@example.test",
  reviewerId: "bootstrap-id",
  decisionReason: LOCAL_BOOTSTRAP_DECISION,
  hasReviewApplications: true,
  hasManageAccess: true,
};

describe("local bootstrap admin activation policy", () => {
  it("accepts the exact authorized bootstrap identity", () => {
    expect(isVerifiedLocalBootstrapAdmin(valid)).toBe(true);
  });
  it.each([
    { email: "another-admin@example.test" },
    { applicationEmail: "another-admin@example.test" },
    { reviewerId: "other-user" },
    { decisionReason: "approved normally" },
    { hasReviewApplications: false },
    { hasManageAccess: false },
  ])("rejects invalid bootstrap evidence: %o", (change) => {
    expect(isVerifiedLocalBootstrapAdmin({ ...valid, ...change })).toBe(false);
  });
});
