import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accessApplicationStatus, accessApplications } from "./access-schema";
import { user } from "./auth-schema";
import { organizations } from "./grants-schema";

export const accessDecisionAudit = pgTable(
  "access_decision_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    applicationId: uuid("application_id")
      .notNull()
      .references(() => accessApplications.id, {
        onDelete: "restrict",
      }),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),

    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    previousStatus: accessApplicationStatus("previous_status").notNull(),

    newStatus: accessApplicationStatus("new_status").notNull(),

    reason: text("reason"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("access_decision_audit_application_unique").on(
      table.applicationId,
    ),

    index("access_decision_audit_actor_idx").on(table.actorUserId),
  ],
);
