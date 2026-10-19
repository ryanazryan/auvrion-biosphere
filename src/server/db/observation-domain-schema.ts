/** AB-WC-007 candidate foundation. Additive tables, not a production ingestion API. */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { organizations } from "./grants-schema";

export const observationDomain = pgEnum("observation_domain", [
  "biodiversity",
  "environmental_risk",
]);
export const sourceKind = pgEnum("observation_source_kind", [
  "manual",
  "listen_device",
  "prevent_device",
  "visual_device",
  "external_provider",
]);
export const ingestionMode = pgEnum("observation_ingestion_mode", [
  "live",
  "historical",
  "simulation",
]);
export const qualityFlag = pgEnum("observation_quality_flag", [
  "unreviewed",
  "valid",
  "suspect",
  "invalid",
]);

export const observationSources = pgTable(
  "observation_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: sourceKind("kind").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    providerName: text("provider_name"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("observation_sources_org_code_uk").on(t.organizationId, t.code),
    uniqueIndex("observation_sources_id_org_uk").on(t.id, t.organizationId),
  ],
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id").notNull(),
    domain: observationDomain("domain").notNull(),
    ingestionMode: ingestionMode("ingestion_mode").notNull(),
    sourceRecordId: text("source_record_id"),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    unknownObservedTimeReason: text("unknown_observed_time_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationUnknownReason: text("location_unknown_reason"),
    quality: qualityFlag("quality").notNull().default("unreviewed"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    // Composite key forbids cross-organization source references at database level.
    foreignKey({
      name: "observations_source_org_fk",
      columns: [t.sourceId, t.organizationId],
      foreignColumns: [
        observationSources.id,
        observationSources.organizationId,
      ],
    }),
    check(
      "observations_lat_range_ck",
      sql`${t.latitude} IS NULL OR (${t.latitude} >= -90 AND ${t.latitude} <= 90)`,
    ),
    check(
      "observations_lon_range_ck",
      sql`${t.longitude} IS NULL OR (${t.longitude} >= -180 AND ${t.longitude} <= 180)`,
    ),
    check(
      "observations_location_pair_ck",
      sql`(${t.latitude} IS NULL) = (${t.longitude} IS NULL)`,
    ),
    check(
      "observations_observed_reason_ck",
      sql`${t.observedAt} IS NOT NULL OR nullif(btrim(${t.unknownObservedTimeReason}), '') IS NOT NULL`,
    ),
    check(
      "observations_location_reason_ck",
      sql`${t.latitude} IS NOT NULL OR nullif(btrim(${t.locationUnknownReason}), '') IS NOT NULL`,
    ),
    check("observations_version_ck", sql`${t.version} > 0`),
    uniqueIndex("observations_id_org_uk").on(t.id, t.organizationId),
    uniqueIndex("observations_source_record_uk")
      .on(t.sourceId, t.sourceRecordId)
      .where(sql`${t.sourceRecordId} IS NOT NULL`),
    index("observations_org_received_idx").on(t.organizationId, t.receivedAt),
  ],
);

export const observationProvenance = pgTable(
  "observation_provenance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id")
      .notNull()
      .unique()
      .references(() => observations.id, { onDelete: "restrict" }),
    originalIdentifier: text("original_identifier"),
    acquisitionMethod: text("acquisition_method").notNull(),
    attribution: text("attribution"),
    licenseNote: text("license_note"),
    limitations: jsonb("limitations").$type<string[]>().notNull().default([]),
    payloadSha256: text("payload_sha256"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "observation_provenance_method_ck",
      sql`length(btrim(${t.acquisitionMethod})) > 0`,
    ),
  ],
);

export const environmentalMeasurements = pgTable(
  "environmental_measurements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    measuredValue: numeric("measured_value", {
      precision: 16,
      scale: 6,
    }).notNull(),
    unit: text("unit").notNull(),
    quality: qualityFlag("quality").notNull().default("unreviewed"),
    measuredAt: timestamp("measured_at", { withTimezone: true }),
    calibrationRef: text("calibration_ref"),
  },
  (t) => [
    index("environmental_measurements_observation_idx").on(t.observationId),
    check(
      "environmental_measurement_nonempty_kind_ck",
      sql`length(btrim(${t.kind})) > 0`,
    ),
    check(
      "environmental_measurement_nonempty_unit_ck",
      sql`length(btrim(${t.unit})) > 0`,
    ),
  ],
);

export const ecosystemProfiles = pgTable("ecosystem_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  ecosystemKind: text("ecosystem_kind").notNull().default("unknown"),
  soilKind: text("soil_kind").notNull().default("unknown"),
  hydrologicalContext: text("hydrological_context")
    .notNull()
    .default("unknown"),
  referenceSource: text("reference_source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const domainCases = pgTable(
  "domain_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    // Status is intentionally not persisted yet: state machine transition policy is still OPEN.
    version: integer("version").notNull().default(1),
    openedByUserId: text("opened_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("domain_cases_id_org_uk").on(t.id, t.organizationId),
    check("domain_cases_version_ck", sql`${t.version} > 0`),
  ],
);

export const caseObservationLinks = pgTable(
  "case_observation_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id").notNull(),
    observationId: uuid("observation_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    linkedByUserId: text("linked_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    linkReason: text("link_reason").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    unlinkedByUserId: text("unlinked_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    foreignKey({
      name: "case_observation_links_case_org_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [domainCases.id, domainCases.organizationId],
    }),
    foreignKey({
      name: "case_observation_links_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }),
    uniqueIndex("case_observation_active_observation_uk")
      .on(t.observationId)
      .where(sql`${t.unlinkedAt} IS NULL`),
    uniqueIndex("case_observation_active_pair_uk")
      .on(t.caseId, t.observationId)
      .where(sql`${t.unlinkedAt} IS NULL`),
    check(
      "case_observation_reason_ck",
      sql`length(btrim(${t.linkReason})) > 0`,
    ),
    check(
      "case_observation_unlink_ck",
      sql`${t.unlinkedAt} IS NULL OR (${t.unlinkedByUserId} IS NOT NULL AND ${t.unlinkedAt} >= ${t.linkedAt})`,
    ),
  ],
);
