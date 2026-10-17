import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { session, user } from "./auth-schema";

export const mfaSessionAssurance = pgTable(
  "mfa_session_assurance",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [index("mfa_session_assurance_user_id_idx").on(table.userId)],
);
