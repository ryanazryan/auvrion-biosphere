/** Provenance for explicitly owner-invited production demo administrators.
 * This is an authorization prerequisite, never a substitute for invitation
 * consumption, MFA, approved application, or an active capability grant.
 */
export const PRODUCTION_REVIEWER_INVITE_DECISION =
  "PRODUCTION DEMO ADMIN: owner-invited reviewer";

export function isProductionReviewerInvitation(input: {
  environment?: string;
  configuredOwnerEmail?: string;
  inviterEmail?: string;
  issuerId?: string;
  reviewerId?: string | null;
  decisionReason?: string | null;
  hasReviewApplications: boolean;
  hasManageAccess: boolean;
}): boolean {
  const owner = input.configuredOwnerEmail?.trim().toLowerCase();
  return Boolean(
    input.environment === "production" &&
      owner &&
      owner !== "dev-admin@example.test" &&
      input.inviterEmail?.trim().toLowerCase() === owner &&
      input.issuerId &&
      input.reviewerId === input.issuerId &&
      input.decisionReason === PRODUCTION_REVIEWER_INVITE_DECISION &&
      input.hasReviewApplications &&
      input.hasManageAccess,
  );
}
