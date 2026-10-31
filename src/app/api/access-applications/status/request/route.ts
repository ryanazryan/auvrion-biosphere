import { eq, lte } from "drizzle-orm";
import { sendApplicantStatusLink } from "@/server/access-status/mailer";
import {
  createStatusLinkToken,
  STATUS_LINK_COOLDOWN_SECONDS,
} from "@/server/access-status/tokens";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "@/server/account-activation/onboarding-environment";
import { consumeOnboardingBudget } from "@/server/account-activation/public-rate-limit";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { accessStatusRecovery } from "@/server/db/access-status-schema";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
const accepted = () =>
  Response.json(
    {
      message:
        "Jika permohonan terdaftar, instruksi status akan dikirim lewat email.",
    },
    { status: 202, headers },
  );

export async function POST(request: Request) {
  if (!onboardingEnabled(process.env))
    return Response.json({ error: "NOT_AVAILABLE" }, { status: 404, headers });
  if (!isAllowedOnboardingOrigin(request, process.env)) {
    return Response.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  }
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return Response.json(
      { error: "INVALID_CONTENT_TYPE" },
      { status: 415, headers },
    );
  }

  // Hard limit, including chunked bodies.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1024)
        return Response.json(
          { error: "INVALID_INPUT" },
          { status: 400, headers },
        );
      chunks.push(value);
    }
  } catch {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("email" in body) ||
    typeof body.email !== "string"
  ) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  }
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  }

  // Share the budget across app instances. Unknown emails remain indistinguishable.
  try {
    if (!(await consumeOnboardingBudget(request, "status-email", email))) {
      return accepted();
    }
  } catch {
    return Response.json(
      { error: "SERVICE_UNAVAILABLE" },
      { status: 503, headers },
    );
  }

  const now = new Date();
  const threshold = new Date(
    now.getTime() - STATUS_LINK_COOLDOWN_SECONDS * 1000,
  );
  const recovery = createStatusLinkToken();
  let recipient: string | null = null;
  try {
    await getDb().transaction(async (tx) => {
      const [application] = await tx
        .select({
          id: accessApplications.id,
          email: accessApplications.email,
        })
        .from(accessApplications)
        .where(eq(accessApplications.email, email))
        .orderBy(accessApplications.createdAt)
        .limit(1)
        .for("update");
      if (!application) return;

      const [issued] = await tx
        .insert(accessStatusRecovery)
        .values({
          applicationId: application.id,
          tokenHash: recovery.tokenHash,
          expiresAt: recovery.expiresAt,
          lastSentAt: now,
          usedAt: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: accessStatusRecovery.applicationId,
          set: {
            tokenHash: recovery.tokenHash,
            expiresAt: recovery.expiresAt,
            lastSentAt: now,
            usedAt: null,
            updatedAt: now,
          },
          setWhere: lte(accessStatusRecovery.lastSentAt, threshold),
        })
        .returning({ id: accessStatusRecovery.id });
      if (issued) recipient = application.email;
    });
    if (recipient)
      await sendApplicantStatusLink({ to: recipient, token: recovery.token });
  } catch {
    console.error(
      "Local applicant status email dispatch failed; delivery not confirmed",
    );
    // Never expose existence of a submitted application or SMTP errors to anonymous callers.
    // Production requires a durable email outbox and IP/account abuse controls.
  }
  return accepted();
}
