import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { and, eq, isNull } from "drizzle-orm";
import { isTotpEnrollmentEligible } from "@/server/auth/enrollment-eligibility";
import {
  hasMfaSessionAssurance,
  hasRecentMfaAssurance,
  recordMfaSessionAssurance,
} from "@/server/auth/mfa-assurance-store";
import { sendLocalPasswordResetOtp } from "@/server/auth/password-reset-mailer";
import {
  isAllowedPasswordRecoveryEndpoint,
  isEmailOtpPluginEndpoint,
  localPasswordRecoveryEnabled,
  PASSWORD_RESET_OTP_ATTEMPTS,
  PASSWORD_RESET_OTP_LENGTH,
  PASSWORD_RESET_OTP_TTL_SECONDS,
  passwordResetEligibleInput,
  passwordResetStrongPassword,
} from "@/server/auth/password-reset-policy";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import * as authSchema from "@/server/db/auth-schema";
import { adminCapabilityGrants, roleGrants } from "@/server/db/grants-schema";

// Set only after Better Auth verifies a WebAuthn assertion with user verification.
const verifiedPasskeyContexts = new WeakSet<object>();

async function assertPasskeyAccountAllowed(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}): Promise<void> {
  if (!user.emailVerified) {
    throw new APIError("FORBIDDEN", { message: "EMAIL_NOT_VERIFIED" });
  }
  const db = getDb();
  const [access] = await db
    .select({
      status: userAccess.status,
      applicationStatus: accessApplications.status,
      applicationEmail: accessApplications.email,
      verifiedAt: accessApplications.emailVerifiedAt,
      reviewedAt: accessApplications.reviewedAt,
      reviewedById: accessApplications.reviewedById,
    })
    .from(userAccess)
    .innerJoin(
      accessApplications,
      eq(userAccess.applicationId, accessApplications.id),
    )
    .where(eq(userAccess.userId, user.id))
    .limit(1);
  if (
    access?.status !== "active" ||
    access.applicationStatus !== "approved" ||
    !access.verifiedAt ||
    !access.reviewedAt ||
    !access.reviewedById ||
    access.applicationEmail.trim().toLowerCase() !==
      user.email.trim().toLowerCase()
  ) {
    throw new APIError("FORBIDDEN", { message: "ACCOUNT_NOT_AUTHORIZED" });
  }
  const [[operational], [admin]] = await Promise.all([
    db
      .select({ id: roleGrants.id })
      .from(roleGrants)
      .where(and(eq(roleGrants.userId, user.id), isNull(roleGrants.revokedAt)))
      .limit(1),
    db
      .select({ id: adminCapabilityGrants.id })
      .from(adminCapabilityGrants)
      .where(
        and(
          eq(adminCapabilityGrants.userId, user.id),
          isNull(adminCapabilityGrants.revokedAt),
        ),
      )
      .limit(1),
  ]);
  if (!operational && !admin) {
    throw new APIError("FORBIDDEN", { message: "ROLE_OR_SCOPE_DENIED" });
  }
}

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET is missing or too short");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is not configured");
}

/**
 * Request-local eligibility for recording login MFA.
 *
 * A TOTP verification for an existing authenticated session
 * (e.g. authenticator enrollment) must never be mistaken for
 * an MFA-gated login.
 */
const mfaLoginCandidates = new WeakSet<object>();

export const auth = betterAuth({
  appName: "Auvrion Biosphere",

  secret,
  baseURL,

  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: authSchema,
  }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },

  session: {
    cookieCache: {
      enabled: false,
    },
  },

  plugins: [
    emailOTP({
      disableSignUp: true,
      otpLength: PASSWORD_RESET_OTP_LENGTH,
      expiresIn: PASSWORD_RESET_OTP_TTL_SECONDS,
      allowedAttempts: PASSWORD_RESET_OTP_ATTEMPTS,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "forget-password")
          throw new Error("EMAIL_OTP_TYPE_DENIED");
        await sendLocalPasswordResetOtp({ email, otp });
      },
    }),
    twoFactor({
      issuer: "Auvrion Biosphere",
      skipVerificationOnEnable: false,
    }),
    passkey({
      rpID: new URL(baseURL).hostname,
      rpName: "Auvrion Biosphere",
      origin: new URL(baseURL).origin,
      registration: {
        requireSession: true,
        afterVerification({ verification }) {
          if (verification.registrationInfo?.userVerified !== true) {
            throw new APIError("FORBIDDEN", {
              message: "PASSKEY_USER_VERIFICATION_REQUIRED",
            });
          }
        },
      },
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
      },
      authentication: {
        async afterVerification({ ctx, verification, clientData }) {
          if (process.env.ENABLE_PASSKEY_SIGNIN !== "YES") {
            throw new APIError("FORBIDDEN", {
              message: "PASSKEY_SIGNIN_NOT_ENABLED",
            });
          }
          if (verification.authenticationInfo?.userVerified !== true) {
            throw new APIError("FORBIDDEN", {
              message: "PASSKEY_USER_VERIFICATION_REQUIRED",
            });
          }
          const [record] = await getDb()
            .select({ userId: authSchema.passkey.userId })
            .from(authSchema.passkey)
            .where(eq(authSchema.passkey.credentialID, clientData.id))
            .limit(1);
          if (!record) {
            throw new APIError("FORBIDDEN", { message: "PASSKEY_NOT_FOUND" });
          }
          const user = await ctx.context.internalAdapter.findUserById(
            record.userId,
          );
          if (!user) {
            throw new APIError("FORBIDDEN", {
              message: "ACCOUNT_NOT_AUTHORIZED",
            });
          }
          await assertPasskeyAccountAllowed({
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
          });
          verifiedPasskeyContexts.add(ctx.context);
        },
      },
    }),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Credential enrollment is opt-in; nobody must own a passkey to use TOTP.
      const passkeyLoginPaths = new Set([
        "/passkey/generate-authenticate-options",
        "/passkey/verify-authentication",
      ]);
      if (
        passkeyLoginPaths.has(ctx.path) &&
        process.env.ENABLE_PASSKEY_SIGNIN !== "YES"
      ) {
        throw new APIError("FORBIDDEN", {
          message: "PASSKEY_SIGNIN_NOT_ENABLED",
        });
      }
      const passkeyPaths = new Set([
        "/passkey/generate-register-options",
        "/passkey/verify-registration",
        "/passkey/list-user-passkeys",
        "/passkey/delete-passkey",
        "/passkey/update-passkey",
      ]);
      if (passkeyPaths.has(ctx.path)) {
        if (!ctx.headers) {
          throw new APIError("UNAUTHORIZED", { message: "SESSION_REQUIRED" });
        }
        const signed = await auth.api.getSession({ headers: ctx.headers });
        if (!signed) {
          throw new APIError("UNAUTHORIZED", { message: "SESSION_REQUIRED" });
        }
        await assertPasskeyAccountAllowed({
          id: signed.user.id,
          email: signed.user.email,
          emailVerified: signed.user.emailVerified,
        });
        // Registration must not rotate an authenticated session.
        if (
          ctx.path === "/passkey/verify-registration" &&
          (ctx.body as { createSession?: unknown } | undefined)
            ?.createSession === true
        ) {
          throw new APIError("FORBIDDEN", {
            message: "SESSION_CREATION_NOT_ALLOWED",
          });
        }
        const mfa = {
          sessionId: signed.session.id,
          userId: signed.user.id,
        };
        if (!(await hasMfaSessionAssurance(mfa))) {
          throw new APIError("FORBIDDEN", { message: "MFA_REQUIRED" });
        }
        // Viewing registered devices only needs active-session MFA; edits need
        // a recent, user-initiated TOTP step-up, available at any time.
        if (
          ctx.path !== "/passkey/list-user-passkeys" &&
          !(await hasRecentMfaAssurance(mfa))
        ) {
          throw new APIError("FORBIDDEN", { message: "RECENT_MFA_REQUIRED" });
        }
      }
      // Avoid adding OTP-based sign-in / sign-up as a bypass of mandatory TOTP.
      if (isEmailOtpPluginEndpoint(ctx.path)) {
        if (
          !localPasswordRecoveryEnabled(process.env) ||
          !isAllowedPasswordRecoveryEndpoint(ctx.path)
        ) {
          throw new APIError("FORBIDDEN", { message: "EMAIL_OTP_NOT_ALLOWED" });
        }
        if (!passwordResetEligibleInput(ctx.body)) {
          throw new APIError("BAD_REQUEST", {
            message: "INVALID_RESET_REQUEST",
          });
        }
        if (ctx.path === "/email-otp/reset-password") {
          const input = ctx.body as Record<string, unknown>;
          if (
            !passwordResetStrongPassword(input.password) ||
            typeof input.otp !== "string" ||
            !/^\d{8}$/.test(input.otp)
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "INVALID_RESET_REQUEST",
            });
          }
        }
      }
      // V1 does not allow disabling factors or independently
      // regenerating recovery credentials.
      const blockedPaths = new Set([
        "/two-factor/disable",
        "/two-factor/generate-backup-codes",
        "/two-factor/get-totp-uri",
        "/two-factor/view-backup-codes",
      ]);

      if (blockedPaths.has(ctx.path)) {
        throw new APIError("FORBIDDEN", {
          message: "SECURITY_FACTOR_CHANGE_NOT_AVAILABLE",
        });
      }

      if (
        ctx.path === "/two-factor/verify-totp" ||
        ctx.path === "/two-factor/verify-backup-code" ||
        ctx.path === "/two-factor/verify-otp"
      ) {
        const body = ctx.body as { trustDevice?: unknown } | undefined;

        if (body?.trustDevice === true) {
          throw new APIError("FORBIDDEN", {
            message: "TRUSTED_DEVICE_NOT_ALLOWED",
          });
        }
      }

      // Only a TOTP sign-in, not TOTP enrollment,
      // may receive login MFA assurance.
      if (ctx.path === "/two-factor/verify-totp") {
        if (!ctx.headers) {
          throw new APIError("UNAUTHORIZED", {
            message: "UNAUTHENTICATED",
          });
        }

        const existingSession = await auth.api.getSession({
          headers: ctx.headers,
        });

        if (!existingSession) {
          mfaLoginCandidates.add(ctx.context);
        }

        return;
      }

      // Eligibility only controls the BEGINNING of enrollment.
      if (ctx.path !== "/two-factor/enable") {
        return;
      }

      const body = ctx.body as { method?: unknown } | undefined;

      if (body?.method !== undefined && body.method !== "totp") {
        throw new APIError("FORBIDDEN", {
          message: "TOTP_ONLY",
        });
      }

      if (!ctx.headers) {
        throw new APIError("UNAUTHORIZED", {
          message: "UNAUTHENTICATED",
        });
      }

      const session = await auth.api.getSession({
        headers: ctx.headers,
      });

      if (
        !session ||
        !(await isTotpEnrollmentEligible({
          id: session.user.id,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
        }))
      ) {
        throw new APIError("FORBIDDEN", {
          message: "MFA_ENROLLMENT_NOT_ALLOWED",
        });
      }
    }),

    after: createAuthMiddleware(async (ctx) => {
      // Passkey session assurance must be recorded only for a cryptographically
      // verified WebAuthn assertion whose UV flag is true and account is active.
      if (ctx.path === "/passkey/verify-authentication") {
        if (!verifiedPasskeyContexts.has(ctx.context)) return;
        verifiedPasskeyContexts.delete(ctx.context);
        const signed = ctx.context.newSession;
        if (!signed || signed.session.userId !== signed.user.id) return;
        await recordMfaSessionAssurance({
          sessionId: signed.session.id,
          userId: signed.user.id,
          sessionExpiresAt: signed.session.expiresAt,
        });
        return;
      }
      if (ctx.path !== "/two-factor/verify-totp") {
        return;
      }

      // Reject enrollment / verification within an
      // already-authenticated session.
      if (!mfaLoginCandidates.has(ctx.context)) {
        return;
      }

      mfaLoginCandidates.delete(ctx.context);

      // Better Auth issues a new session after successful
      // MFA-gated sign-in.
      const newSession = ctx.context.newSession;

      if (!newSession) {
        return;
      }

      const issuedSession = newSession.session;
      const issuedUser = newSession.user;

      if (
        !issuedSession?.id ||
        !issuedUser?.id ||
        issuedSession.userId !== issuedUser.id
      ) {
        return;
      }

      await recordMfaSessionAssurance({
        sessionId: issuedSession.id,
        userId: issuedUser.id,
        sessionExpiresAt: issuedSession.expiresAt,
      });
    }),
  },
});
