import { isNull } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { userAccess } from "./access-schema";
import { user } from "./auth-schema";

export const operationalRole = pgEnum("operational_role", [
  "operator",
  "supervisor",
  "ranger",
]);

export const adminCapability = pgEnum("admin_capability", [
  "review_applications",
  "manage_access",
  "manage_devices",
  "manage_config",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),

  code: text("code").notNull().unique(),
  name: text("name").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const roleGrants = pgTable(
  "role_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => userAccess.userId, {
        onDelete: "restrict",
      }),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),

    role: operationalRole("role").notNull(),

    grantedById: text("granted_by_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    grantedAt: timestamp("granted_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),

    revokedById: text("revoked_by_id").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    uniqueIndex("role_grants_active_unique")
      .on(table.userId, table.organizationId, table.role)
      .where(isNull(table.revokedAt)),
  ],
);

export const adminCapabilityGrants = pgTable(
  "admin_capability_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => userAccess.userId, {
        onDelete: "restrict",
      }),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),

    capability: adminCapability("capability").notNull(),

    grantedById: text("granted_by_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    grantedAt: timestamp("granted_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),

    revokedById: text("revoked_by_id").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    uniqueIndex("admin_capability_grants_active_unique")
      .on(table.userId, table.organizationId, table.capability)
      .where(isNull(table.revokedAt)),
  ],
);
