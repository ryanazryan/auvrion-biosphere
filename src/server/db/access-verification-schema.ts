import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { accessApplications } from "./access-schema";

export const accessEmailVerificationTokens = pgTable(
  "access_email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => accessApplications.id, {
        onDelete: "cascade",
      }),

    tokenHash: text("token_hash").notNull().unique(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    lastSentAt: timestamp("last_sent_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    usedAt: timestamp("used_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("access_email_verification_expires_idx").on(table.expiresAt),
  ],
);
