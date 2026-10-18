import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accessApplications } from "./access-schema";
import { user } from "./auth-schema";

export const accountActivationInvites = pgTable(
  "account_activation_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => accessApplications.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    issuedById: text("issued_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_activation_invites_application_unique").on(
      table.applicationId,
    ),
    uniqueIndex("account_activation_invites_user_unique").on(table.userId),
    index("account_activation_invites_expires_idx").on(table.expiresAt),
  ],
);
