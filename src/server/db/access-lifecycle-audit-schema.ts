import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { userAccessStatus } from "./access-schema";
import { user } from "./auth-schema";
import { operationalRole, organizations } from "./grants-schema";

export const accessLifecycleAuditAction = pgEnum(
  "access_lifecycle_audit_action",
  ["role_granted", "role_changed", "role_revoked", "account_disabled"],
);

/** Append-only from the application surface. No mutation endpoints are exposed. */
export const accessLifecycleAudit = pgTable(
  "access_lifecycle_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: accessLifecycleAuditAction("action").notNull(),
    previousRole: operationalRole("previous_role"),
    newRole: operationalRole("new_role"),
    previousStatus: userAccessStatus("previous_status").notNull(),
    newStatus: userAccessStatus("new_status").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("access_lifecycle_audit_target_idx").on(table.targetUserId),
    index("access_lifecycle_audit_actor_idx").on(table.actorUserId),
    index("access_lifecycle_audit_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);
