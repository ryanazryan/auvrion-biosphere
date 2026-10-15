import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const accessApplicationStatus = pgEnum("access_application_status", [
  "submitted",
  "email_verified",
  "approved",
  "rejected",
]);

export const userAccessStatus = pgEnum("user_access_status", [
  "pending_activation",
  "active",
  "disabled",
]);

export const accessApplications = pgTable(
  "access_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    applicantName: text("applicant_name").notNull(),
    email: text("email").notNull(),

    status: accessApplicationStatus("status").default("submitted").notNull(),

    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
    }),

    reviewedById: text("reviewed_by_id").references(() => user.id, {
      onDelete: "restrict",
    }),

    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
    }),

    decisionReason: text("decision_reason"),

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
    index("access_applications_email_idx").on(table.email),
    index("access_applications_status_idx").on(table.status),
  ],
);

export const userAccess = pgTable("user_access", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "restrict" }),

  applicationId: uuid("application_id")
    .notNull()
    .unique()
    .references(() => accessApplications.id, {
      onDelete: "restrict",
    }),

  status: userAccessStatus("status").default("pending_activation").notNull(),

  activatedAt: timestamp("activated_at", {
    withTimezone: true,
  }),

  disabledAt: timestamp("disabled_at", {
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
});
