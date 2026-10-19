/**
 * AB-WC-007 Slice 04 — minimal, additive, versioned report provenance.
 * No publication API, data release, PDF creation or automatic legal retention.
 * Services must enforce role/org scope and immutable snapshots on publication.
 * Dates use Asia/Makassar for the single demo organization (BR-014).
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { organizations } from "./grants-schema";
import { domainCases, observations } from "./observation-domain-schema";
import { domainTasks } from "./operations-domain-schema";

/** A version is append-oriented, and one day/scope can have several revisions. */
export const reportVersions = pgTable(
  "report_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    localDay: date("local_day", { mode: "string" }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Makassar"),
    scopeHash: text("scope_hash").notNull(),
    scopeSnapshot: jsonb("scope_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    revision: integer("revision").notNull(),
    // NULL means not computed; never infer zero from an absent reading.
    counts: jsonb("counts").$type<Record<string, unknown>>(),
    limitations: jsonb("limitations")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    generatedByUserId: text("generated_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (t) => [
    // Table-level unique constraints are available before FK creation by Drizzle Kit.
    unique("report_versions_id_org_uq").on(t.id, t.organizationId),
    unique("report_versions_revision_uq").on(
      t.organizationId,
      t.localDay,
      t.timezone,
      t.scopeHash,
      t.revision,
    ),
    uniqueIndex("report_versions_one_current_published_uq")
      .on(t.organizationId, t.localDay, t.timezone, t.scopeHash)
      .where(sql`${t.publishedAt} IS NOT NULL AND ${t.supersededAt} IS NULL`),
    check("report_versions_revision_positive_ck", sql`${t.revision} > 0`),
    check("report_versions_timezone_ck", sql`${t.timezone} = 'Asia/Makassar'`),
    check(
      "report_versions_scope_hash_ck",
      sql`${t.scopeHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "report_versions_scope_object_ck",
      sql`jsonb_typeof(${t.scopeSnapshot}) = 'object'`,
    ),
    check(
      "report_versions_counts_object_ck",
      sql`${t.counts} IS NULL OR jsonb_typeof(${t.counts}) = 'object'`,
    ),
    check(
      "report_versions_limitations_array_ck",
      sql`jsonb_typeof(${t.limitations}) = 'array'`,
    ),
    check(
      "report_versions_publication_order_ck",
      sql`${t.supersededAt} IS NULL OR (${t.publishedAt} IS NOT NULL AND ${t.supersededAt} >= ${t.publishedAt})`,
    ),
  ],
);

/**
 * Denormalized target columns enable real same-organization composite FKs.
 * Exactly one observation/case/task per input. Other categories need explicit
 * schema + owner scope review, not an unchecked polymorphic object pointer.
 * inputSnapshot is an as-of snapshot (service must enforce no post-publication edits).
 */
export const reportInputs = pgTable(
  "report_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    reportVersionId: uuid("report_version_id").notNull(),
    observationId: uuid("observation_id"),
    caseId: uuid("case_id"),
    taskId: uuid("task_id"),
    inputVersion: integer("input_version").notNull(),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "report_inputs_report_org_fk",
      columns: [t.reportVersionId, t.organizationId],
      foreignColumns: [reportVersions.id, reportVersions.organizationId],
    }),
    foreignKey({
      name: "report_inputs_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }),
    foreignKey({
      name: "report_inputs_case_org_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [domainCases.id, domainCases.organizationId],
    }),
    foreignKey({
      name: "report_inputs_task_org_fk",
      columns: [t.taskId, t.organizationId],
      foreignColumns: [domainTasks.id, domainTasks.organizationId],
    }),
    unique("report_inputs_observation_revision_uq").on(
      t.reportVersionId,
      t.observationId,
      t.inputVersion,
    ),
    unique("report_inputs_case_revision_uq").on(
      t.reportVersionId,
      t.caseId,
      t.inputVersion,
    ),
    unique("report_inputs_task_revision_uq").on(
      t.reportVersionId,
      t.taskId,
      t.inputVersion,
    ),
    check(
      "report_inputs_one_target_ck",
      sql`num_nonnulls(${t.observationId}, ${t.caseId}, ${t.taskId}) = 1`,
    ),
    check("report_inputs_version_positive_ck", sql`${t.inputVersion} > 0`),
    check(
      "report_inputs_snapshot_object_ck",
      sql`jsonb_typeof(${t.inputSnapshot}) = 'object'`,
    ),
  ],
);
