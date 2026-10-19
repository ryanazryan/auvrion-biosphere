import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { accessApplications } from "./access-schema";
import { organizations } from "./grants-schema";

export const accessDecisionNotificationKind = pgEnum(
  "access_decision_notification_kind",
  ["approved", "rejected"],
);

export const accessDecisionNotificationStatus = pgEnum(
  "access_decision_notification_status",
  ["pending", "processing", "sent"],
);

export const accessDecisionNotifications = pgTable(
  "access_decision_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => accessApplications.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: accessDecisionNotificationKind("kind").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name").notNull(),
    status: accessDecisionNotificationStatus("status")
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("access_decision_notifications_queue_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  ],
);
