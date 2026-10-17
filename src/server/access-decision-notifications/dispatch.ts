import "server-only";

import { and, eq, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import { accessDecisionNotifications } from "@/server/db/access-decision-notification-schema";
import { sendDecisionNotificationEmail } from "./mailer";
import { notificationRetryDelaySeconds } from "./retry";

export type DispatchResult = "idle" | "sent" | "retry_scheduled";

const PROCESSING_LEASE_MS = 5 * 60_000;

/**
 * Claims one queued notification atomically. A stale processing lease can be
 * recovered after a crash. Delivery semantics are AT-LEAST-ONCE, not exactly once.
 */
export async function dispatchDecisionNotification(
  notificationId?: string,
): Promise<DispatchResult> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    throw new Error("LOCAL_DECISION_DISPATCH_DISABLED");
  }

  const db = getDb();
  const now = new Date();
  const leaseExpiredAt = new Date(now.getTime() - PROCESSING_LEASE_MS);

  const queued = or(
    eq(accessDecisionNotifications.status, "pending"),
    and(
      eq(accessDecisionNotifications.status, "processing"),
      lte(accessDecisionNotifications.processingStartedAt, leaseExpiredAt),
    ),
  );

  const claim = await db.transaction(async (tx) => {
    const eligible = and(
      queued,
      lte(accessDecisionNotifications.nextAttemptAt, now),
      ...(notificationId
        ? [eq(accessDecisionNotifications.id, notificationId)]
        : []),
    );

    const [record] = await tx
      .select({ id: accessDecisionNotifications.id })
      .from(accessDecisionNotifications)
      .where(eligible)
      .orderBy(accessDecisionNotifications.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });

    if (!record) return null;

    const [updated] = await tx
      .update(accessDecisionNotifications)
      .set({
        status: "processing",
        processingStartedAt: now,
        attempts: sql`${accessDecisionNotifications.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(accessDecisionNotifications.id, record.id))
      .returning({
        id: accessDecisionNotifications.id,
        kind: accessDecisionNotifications.kind,
        recipientEmail: accessDecisionNotifications.recipientEmail,
        recipientName: accessDecisionNotifications.recipientName,
        attempts: accessDecisionNotifications.attempts,
        processingStartedAt: accessDecisionNotifications.processingStartedAt,
      });

    return updated ?? null;
  });

  if (!claim?.processingStartedAt) return "idle";

  const stillClaimed = and(
    eq(accessDecisionNotifications.id, claim.id),
    eq(accessDecisionNotifications.status, "processing"),
    eq(
      accessDecisionNotifications.processingStartedAt,
      claim.processingStartedAt,
    ),
  );

  try {
    await sendDecisionNotificationEmail({
      kind: claim.kind,
      recipientEmail: claim.recipientEmail,
      recipientName: claim.recipientName,
    });
  } catch {
    const retryAt = new Date(
      Date.now() + notificationRetryDelaySeconds(claim.attempts) * 1000,
    );

    await db
      .update(accessDecisionNotifications)
      .set({
        status: "pending",
        nextAttemptAt: retryAt,
        processingStartedAt: null,
        lastError: "SMTP_DELIVERY_FAILED",
        updatedAt: new Date(),
      })
      .where(stillClaimed);

    return "retry_scheduled";
  }

  // SMTP accepted the message. Do not treat a later DB failure as an SMTP
  // failure: the row's lease will expire and an at-least-once retry can occur.
  await db
    .update(accessDecisionNotifications)
    .set({
      status: "sent",
      sentAt: new Date(),
      processingStartedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(stillClaimed);

  return "sent";
}
