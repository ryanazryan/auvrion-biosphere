import { and, eq, isNull, lte } from "drizzle-orm";
import { sendAccessVerificationEmail } from "@/server/access-verification/mailer";
import {
  createVerificationToken,
  EMAIL_VERIFICATION_RESEND_SECONDS,
} from "@/server/access-verification/token";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { accessEmailVerificationTokens } from "@/server/db/access-verification-schema";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

const responseHeaders = {
  "Cache-Control": "no-store",
};

function accepted() {
  return Response.json(
    {
      message:
        "Jika permohonan memenuhi syarat, email verifikasi akan dikirim.",
    },
    {
      status: 202,
      headers: responseHeaders,
    },
  );
}

function reject(error: string, status: number) {
  return Response.json({ error }, { status, headers: responseHeaders });
}

function isLocalRequestAllowed(request: Request): boolean {
  const url = new URL(request.url);

  return (
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS === "YES" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    request.headers.get("origin") === url.origin
  );
}

async function readEmail(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();

  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);

    const body: unknown = JSON.parse(text);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !("email" in body) ||
      typeof body.email !== "string"
    ) {
      return null;
    }

    const email = body.email.trim().toLowerCase();

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return null;
    }

    return email;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    return reject("NOT_AVAILABLE", 404);
  }

  if (!isLocalRequestAllowed(request)) {
    return reject("INVALID_ORIGIN", 403);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return reject("INVALID_CONTENT_TYPE", 415);
  }

  const email = await readEmail(request);

  if (!email) {
    return reject("INVALID_INPUT", 400);
  }

  const db = getDb();
  const now = new Date();

  const cooldownThreshold = new Date(
    now.getTime() - EMAIL_VERIFICATION_RESEND_SECONDS * 1000,
  );

  const verification = createVerificationToken();

  let recipient: string | null = null;

  try {
    // Lock the application while deciding whether a token
    // can be issued. This avoids simultaneous resend races.
    await db.transaction(async (tx) => {
      const [application] = await tx
        .select({
          id: accessApplications.id,
          email: accessApplications.email,
          status: accessApplications.status,
          emailVerifiedAt: accessApplications.emailVerifiedAt,
        })
        .from(accessApplications)
        .where(eq(accessApplications.email, email))
        .orderBy(accessApplications.createdAt)
        .limit(1)
        .for("update");

      if (!application) {
        return;
      }

      if (
        application.status !== "submitted" ||
        application.emailVerifiedAt !== null
      ) {
        return;
      }

      // One token record per application.
      // A resend replaces the previous token only
      // when the server-side cooldown has elapsed.
      const [issued] = await tx
        .insert(accessEmailVerificationTokens)
        .values({
          applicationId: application.id,
          tokenHash: verification.tokenHash,
          expiresAt: verification.expiresAt,
          lastSentAt: now,
          usedAt: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: accessEmailVerificationTokens.applicationId,
          set: {
            tokenHash: verification.tokenHash,
            expiresAt: verification.expiresAt,
            lastSentAt: now,
            usedAt: null,
            updatedAt: now,
          },
          setWhere: and(
            lte(accessEmailVerificationTokens.lastSentAt, cooldownThreshold),
            isNull(accessEmailVerificationTokens.usedAt),
          ),
        })
        .returning({
          id: accessEmailVerificationTokens.id,
        });

      if (issued) {
        recipient = application.email;
      }
    });

    if (recipient !== null) {
      await sendAccessVerificationEmail({
        to: recipient,
        token: verification.token,
      });
    }
  } catch {
    // Do not disclose whether a particular address
    // exists or whether a token was issued.
    // Operational telemetry is required before production.
  }

  return accepted();
}
