import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
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

export const auth = betterAuth({
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
});
