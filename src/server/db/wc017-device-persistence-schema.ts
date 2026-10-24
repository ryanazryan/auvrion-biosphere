/**
 * AB-WC-017 Slice 02B: LISTEN-only device lifecycle persistence.
 * Device tokens are hashed; past credential hashes are retained for non-secret audit.
 * This schema is intentionally additive; the existing local Slice 01 schema is not overwritten.
 */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { organizations } from "./grants-schema";
import { observationSources } from "./observation-domain-schema";

export const ingestionDevices = pgTable(
  "ingestion_devices",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id").notNull(),
    status: text("status").notNull().default("active"),
    credentialVersion: integer("credential_version").notNull().default(1),
    credentialHash: text("credential_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    unique("ingestion_devices_id_org_uq").on(t.id, t.organizationId),
    unique("ingestion_devices_source_uq").on(t.sourceId),
    foreignKey({
      name: "ingestion_devices_source_org_fk",
      columns: [t.sourceId, t.organizationId],
      foreignColumns: [
        observationSources.id,
        observationSources.organizationId,
      ],
    }).onDelete("restrict"),
    check(
      "ingestion_devices_status_ck",
      sql`${t.status} IN ('active', 'revoked')`,
    ),
    check("ingestion_devices_version_ck", sql`${t.credentialVersion} > 0`),
    check(
      "ingestion_devices_revocation_ck",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} IS NOT NULL)`,
    ),
    check(
      "ingestion_devices_revoked_actor_ck",
      sql`(${t.revokedAt} IS NULL) = (${t.revokedByUserId} IS NULL)`,
    ),
  ],
);

export const ingestionDeviceCredentials = pgTable(
  "ingestion_device_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    generation: integer("generation").notNull(),
    credentialHash: text("credential_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: text("retired_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    foreignKey({
      name: "ingestion_credentials_device_org_fk",
      columns: [t.deviceId, t.organizationId],
      foreignColumns: [ingestionDevices.id, ingestionDevices.organizationId],
    }).onDelete("restrict"),
    unique("ingestion_credentials_device_generation_uq").on(
      t.deviceId,
      t.generation,
    ),
    uniqueIndex("ingestion_credentials_one_active_uq")
      .on(t.deviceId)
      .where(sql`${t.retiredAt} IS NULL`),
    index("ingestion_credentials_org_idx").on(t.organizationId, t.deviceId),
    check("ingestion_credentials_generation_ck", sql`${t.generation} > 0`),
    check(
      "ingestion_credentials_retirement_ck",
      sql`(${t.retiredAt} IS NULL) = (${t.retiredByUserId} IS NULL)`,
    ),
    check(
      "ingestion_credentials_time_ck",
      sql`${t.retiredAt} IS NULL OR ${t.retiredAt} >= ${t.createdAt}`,
    ),
  ],
);

export const ingestionDeviceEvents = pgTable(
  "ingestion_device_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    type: text("event_type").notNull(),
    fromVersion: integer("from_version"),
    toVersion: integer("to_version").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "ingestion_events_device_org_fk",
      columns: [t.deviceId, t.organizationId],
      foreignColumns: [ingestionDevices.id, ingestionDevices.organizationId],
    }).onDelete("restrict"),
    unique("ingestion_events_device_version_uq").on(t.deviceId, t.toVersion),
    index("ingestion_events_org_created_idx").on(t.organizationId, t.createdAt),
    check(
      "ingestion_events_type_ck",
      sql`${t.type} IN ('provisioned', 'credential_rotated', 'device_revoked')`,
    ),
    check(
      "ingestion_events_version_ck",
      sql`(${t.type} = 'provisioned' AND ${t.fromVersion} IS NULL AND ${t.toVersion} = 1)
        OR (${t.type} <> 'provisioned' AND ${t.fromVersion} > 0 AND ${t.toVersion} = ${t.fromVersion} + 1)`,
    ),
  ],
);
