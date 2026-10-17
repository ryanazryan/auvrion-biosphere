import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { accessApplications } from "./access-schema";

/** Single outstanding recovery link per application (dev V1). */
export const accessStatusRecovery = pgTable("access_status_recovery", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .unique()
    .references(() => accessApplications.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
