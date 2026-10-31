/** Only the one-time local first-admin bootstrap may omit an activation invite. */
export const LOCAL_BOOTSTRAP_EMAIL = "dev-admin@example.test";
export const LOCAL_BOOTSTRAP_DECISION =
  "LOCAL DEVELOPMENT ONLY: owner-controlled first-admin bootstrap exception";

export function isVerifiedLocalBootstrapAdmin(input: {
  userId: string;
  email: string;
  applicationEmail: string;
  reviewerId: string | null;
  decisionReason: string | null;
  hasReviewApplications: boolean;
  hasManageAccess: boolean;
}): boolean {
  return (
    input.email.trim().toLowerCase() === LOCAL_BOOTSTRAP_EMAIL &&
    input.applicationEmail.trim().toLowerCase() === LOCAL_BOOTSTRAP_EMAIL &&
    input.reviewerId === input.userId &&
    input.decisionReason === LOCAL_BOOTSTRAP_DECISION &&
    input.hasReviewApplications &&
    input.hasManageAccess
  );
}

export const PRODUCTION_BOOTSTRAP_DECISION =
  "PRODUCTION FIRST ADMIN: owner-authorized one-time bootstrap";

export function isVerifiedProductionBootstrapAdmin(input: {
  userId: string;
  email: string;
  applicationEmail: string;
  reviewerId: string | null;
  decisionReason: string | null;
  hasReviewApplications: boolean;
  hasManageAccess: boolean;
  environment: string | undefined;
  configuredOwnerEmail: string | undefined;
}): boolean {
  const ownerEmail = input.configuredOwnerEmail?.trim().toLowerCase();

  if (
    input.environment !== "production" ||
    !ownerEmail ||
    ownerEmail === LOCAL_BOOTSTRAP_EMAIL
  ) {
    return false;
  }

  return (
    input.email.trim().toLowerCase() === ownerEmail &&
    input.applicationEmail.trim().toLowerCase() === ownerEmail &&
    input.reviewerId === input.userId &&
    input.decisionReason === PRODUCTION_BOOTSTRAP_DECISION &&
    input.hasReviewApplications &&
    input.hasManageAccess
  );
}
