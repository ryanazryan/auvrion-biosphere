import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";

import { isTotpEnrollmentEligible } from "@/server/auth/enrollment-eligibility";
import { recordMfaSessionAssurance } from "@/server/auth/mfa-assurance-store";
import { getDb } from "@/server/db";
import * as authSchema from "@/server/db/auth-schema";

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
    twoFactor({
      issuer: "Auvrion Biosphere",
      skipVerificationOnEnable: false,
    }),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
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
