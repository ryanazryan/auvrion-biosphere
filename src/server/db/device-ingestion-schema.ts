/** AB-WC-017 schema proposal. NOT active until a reviewed Drizzle migration is generated and applied. */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./grants-schema";
import { observationSources } from "./observation-domain-schema";

export const deviceLifecycle = pgEnum("device_lifecycle", [
  "active",
  "suspended",
  "revoked",
]);

export const listenDevices = pgTable(
  "listen_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => observationSources.id, { onDelete: "restrict" }),
    status: deviceLifecycle("status").notNull().default("suspended"),
    label: text("label").notNull(),
    credentialHash: text("credential_hash").notNull(),
    credentialVersion: uuid("credential_version").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("listen_devices_source_uk").on(t.sourceId),
    index("listen_devices_org_idx").on(t.organizationId),
    check(
      "listen_devices_label_nonempty_ck",
      sql`length(btrim(${t.label})) > 0`,
    ),
    check(
      "listen_devices_revoked_consistency_ck",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} IS NOT NULL)`,
    ),
  ],
);
