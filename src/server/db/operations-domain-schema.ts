/**
 * AB-WC-007 / Slice 03 — additive V1 domain relations.
 * DB constraints protect tenant boundaries; services must additionally check
 * current role grants, object scope, workflow guards, and media availability.
 * This file defines no API endpoints and does not authorize data access.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { organizations } from "./grants-schema";
import {
  caseWorkflowStatus,
  domainCases,
  observations,
} from "./observation-domain-schema";

// Driver-level geometry is intentionally opaque. For application reads use
// ST_AsGeoJSON(boundary) with explicit role-dependent location precision.
// Inserts should use ST_Multi(ST_GeomFromText(...,4326)) via a guarded service.
// The PostgreSQL PostGIS extension MUST exist before running migration 0012.
const multipolygon4326 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon,4326)";
  },
});

export const evidenceAvailability = pgEnum("evidence_availability", [
  "uploading",
  "available",
  "failed",
  "invalid",
]);

/** Recorded task states only; AB-TR-024..033 remain unapproved. */
export const taskWorkflowStatus = pgEnum("task_workflow_status", [
  "assigned",
  "accepted",
  "in_progress",
  "blocked",
  "submitted",
  "cancelled",
  "completed",
]);

export const operationalZones = pgTable(
  "operational_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // Placeholder for future access review; not a data declassification grant.
    precisionPolicy: text("precision_policy")
      .notNull()
      .default("restricted_pending_policy"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("operational_zones_id_org_uq").on(t.id, t.organizationId),
    unique("operational_zones_code_org_uq").on(t.organizationId, t.code),
    check(
      "operational_zones_code_nonempty_ck",
      sql`length(btrim(${t.code})) > 0`,
    ),
  ],
);

/** New geometry revisions are added; old revisions are retained for audit. */
export const zoneGeometryVersions = pgTable(
  "zone_geometry_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    zoneId: uuid("zone_id").notNull(),
    geometryVersion: integer("geometry_version").notNull(),
    boundary: multipolygon4326("boundary").notNull(),
    referenceSource: text("reference_source"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "zone_geometry_versions_zone_org_fk",
      columns: [t.zoneId, t.organizationId],
      foreignColumns: [operationalZones.id, operationalZones.organizationId],
    }),
    unique("zone_geometry_versions_id_org_uq").on(t.id, t.organizationId),
    unique("zone_geometry_versions_number_uq").on(t.zoneId, t.geometryVersion),
    index("zone_geometry_versions_boundary_gix").using("gist", t.boundary),
    check("zone_geometry_versions_positive_ck", sql`${t.geometryVersion} > 0`),
    check(
      "zone_geometry_versions_valid_ck",
      sql`ST_IsValid(${t.boundary}) AND NOT ST_IsEmpty(${t.boundary})`,
    ),
  ],
);

/** Spatial matches are evidence/context, not authorization grants. */
export const observationZoneMatches = pgTable(
  "observation_zone_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    observationId: uuid("observation_id").notNull(),
    zoneGeometryVersionId: uuid("zone_geometry_version_id").notNull(),
    matchMethod: text("match_method").notNull(),
    matchedByUserId: text("matched_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    matchedAt: timestamp("matched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "observation_zone_matches_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }),
    foreignKey({
      name: "observation_zone_matches_geometry_org_fk",
      columns: [t.zoneGeometryVersionId, t.organizationId],
      foreignColumns: [
        zoneGeometryVersions.id,
        zoneGeometryVersions.organizationId,
      ],
    }),
    unique("observation_zone_matches_pair_uq").on(
      t.observationId,
      t.zoneGeometryVersionId,
    ),
    check(
      "observation_zone_matches_method_ck",
      sql`${t.matchMethod} IN ('covers', 'intersects', 'manual')`,
    ),
    check(
      "observation_zone_matches_manual_actor_ck",
      sql`${t.matchMethod} <> 'manual' OR ${t.matchedByUserId} IS NOT NULL`,
    ),
  ],
);

/** Task updates remain gated: only initial Assigned is permitted in WC-012. */
export const domainTasks = pgTable(
  "domain_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    caseId: uuid("case_id").notNull(),
    title: text("title").notNull(),
    status: taskWorkflowStatus("status").notNull().default("assigned"),
    instructions: text("instructions"),
    safetyNotes: text("safety_notes"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "domain_tasks_case_org_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [domainCases.id, domainCases.organizationId],
    }),
    unique("domain_tasks_id_org_uq").on(t.id, t.organizationId),
    index("domain_tasks_case_idx").on(t.caseId),
    check("domain_tasks_positive_version_ck", sql`${t.version} > 0`),
    check("domain_tasks_nonempty_title_ck", sql`length(btrim(${t.title})) > 0`),
  ],
);

/**
 * Immutable versioned Case transition ledger for AB-WC-012. The unique case
 * version and request key prevent conflicting commits/replayed write events.
 * Application services must guard scope, MFA, actor and current state, and
 * create the event atomically with Case and (for AB-TR-013) Task/Assignment.
 */
export const caseTransitionEvents = pgTable(
  "case_transition_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    caseId: uuid("case_id").notNull(),
    transitionId: text("transition_id").notNull(),
    fromStatus: caseWorkflowStatus("from_status").notNull(),
    toStatus: caseWorkflowStatus("to_status").notNull(),
    fromVersion: integer("from_version").notNull(),
    toVersion: integer("to_version").notNull(),
    requestId: uuid("request_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),
    reason: text("reason").notNull(),
    taskId: uuid("task_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "case_transition_events_case_org_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [domainCases.id, domainCases.organizationId],
    }),
    foreignKey({
      name: "case_transition_events_task_org_fk",
      columns: [t.taskId, t.organizationId],
      foreignColumns: [domainTasks.id, domainTasks.organizationId],
    }),
    unique("case_transition_events_case_version_uk").on(t.caseId, t.toVersion),
    unique("case_transition_events_case_request_uk").on(t.caseId, t.requestId),
    check(
      "case_transition_events_reason_ck",
      sql`length(btrim(${t.reason})) > 0 AND length(${t.reason}) <= 2000`,
    ),
    check(
      "case_transition_events_version_ck",
      sql`${t.fromVersion} > 0 AND ${t.toVersion} = ${t.fromVersion} + 1`,
    ),
    check(
      "case_transition_events_approved_edges_ck",
      sql`(
        (${t.transitionId} = 'AB-TR-010' AND ${t.fromStatus} = 'received' AND ${t.toStatus} = 'under_review' AND ${t.taskId} IS NULL)
        OR (${t.transitionId} = 'AB-TR-011' AND ${t.fromStatus} = 'under_review' AND ${t.toStatus} = 'awaiting_decision' AND ${t.taskId} IS NULL)
        OR (${t.transitionId} = 'AB-TR-012' AND ${t.fromStatus} = 'awaiting_decision' AND ${t.toStatus} = 'monitoring' AND ${t.taskId} IS NULL)
        OR (${t.transitionId} = 'AB-TR-013' AND ${t.fromStatus} = 'awaiting_decision' AND ${t.toStatus} = 'assigned' AND ${t.taskId} IS NOT NULL)
      )`,
    ),
  ],
);

/** Historical assignments remain; at most one active assignee per task. */
export const taskAssignments = pgTable(
  "task_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    taskId: uuid("task_id").notNull(),
    rangerUserId: text("ranger_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    assignedByUserId: text("assigned_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
    unassignedByUserId: text("unassigned_by_user_id").references(
      () => user.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    foreignKey({
      name: "task_assignments_task_org_fk",
      columns: [t.taskId, t.organizationId],
      foreignColumns: [domainTasks.id, domainTasks.organizationId],
    }),
    uniqueIndex("task_assignments_active_task_uk")
      .on(t.taskId)
      .where(sql`${t.unassignedAt} IS NULL`),
    check("task_assignments_reason_ck", sql`length(btrim(${t.reason})) > 0`),
    check(
      "task_assignments_unassign_ck",
      sql`${t.unassignedAt} IS NULL OR (${t.unassignedByUserId} IS NOT NULL AND ${t.unassignedAt} >= ${t.assignedAt})`,
    ),
  ],
);

/** Field report authored by Ranger; server must verify live assignment. */
export const taskFindings = pgTable(
  "task_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    taskId: uuid("task_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    summary: text("summary").notNull(),
    requestId: uuid("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "task_findings_task_org_fk",
      columns: [t.taskId, t.organizationId],
      foreignColumns: [domainTasks.id, domainTasks.organizationId],
    }),
    unique("task_findings_id_org_uq").on(t.id, t.organizationId),
    unique("task_findings_request_uk").on(t.taskId, t.requestId),
    check("task_findings_summary_ck", sql`length(btrim(${t.summary})) > 0`),
  ],
);

/** Private object storage metadata; not an upload validation implementation. */
export const evidenceMedia = pgTable(
  "evidence_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    availability: evidenceAvailability("availability")
      .notNull()
      .default("uploading"),
    sha256: text("sha256"),
    mimeType: text("mime_type"),
    byteLength: bigint("byte_length", { mode: "number" }),
    // This is a placeholder. Legal classification/retention remains OPEN.
    classification: text("classification")
      .notNull()
      .default("restricted_pending_policy"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("evidence_media_id_org_uq").on(t.id, t.organizationId),
    unique("evidence_media_org_storage_uq").on(t.organizationId, t.storageKey),
    check(
      "evidence_media_key_ck",
      sql`length(btrim(${t.storageKey})) > 0 AND ${t.storageKey} !~* '^https?://'`,
    ),
    check(
      "evidence_media_available_metadata_ck",
      sql`${t.availability} <> 'available' OR (${t.sha256} IS NOT NULL AND ${t.sha256} ~ '^[0-9a-fA-F]{64}$' AND ${t.mimeType} IS NOT NULL AND length(btrim(${t.mimeType})) > 0 AND ${t.byteLength} IS NOT NULL AND ${t.byteLength} > 0)`,
    ),
    check(
      "evidence_media_length_ck",
      sql`${t.byteLength} IS NULL OR ${t.byteLength} >= 0`,
    ),
  ],
);

/** Evidence targets exactly one observation OR field finding in one org. */
export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    mediaId: uuid("media_id").notNull(),
    observationId: uuid("observation_id"),
    findingId: uuid("finding_id"),
    linkedByUserId: text("linked_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "evidence_links_media_org_fk",
      columns: [t.mediaId, t.organizationId],
      foreignColumns: [evidenceMedia.id, evidenceMedia.organizationId],
    }),
    foreignKey({
      name: "evidence_links_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }),
    foreignKey({
      name: "evidence_links_finding_org_fk",
      columns: [t.findingId, t.organizationId],
      foreignColumns: [taskFindings.id, taskFindings.organizationId],
    }),
    check(
      "evidence_links_one_target_ck",
      sql`num_nonnulls(${t.observationId}, ${t.findingId}) = 1`,
    ),
    index("evidence_links_media_idx").on(t.mediaId),
  ],
);

/**
 * AB-WC-010 — Durable upload idempotency reservation.
 *
 * A unique (organization, user, key) identifies a logical upload.
 * A processing lease permits safe future recovery with fencing.
 * Completion must reference a media row in the same organization.
 */
export const evidenceUploadStatus = pgEnum("evidence_upload_status", [
  "processing",
  "completed",
  "failed",
]);

export const evidenceUploadRequests = pgTable(
  "evidence_upload_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),

    observationId: uuid("observation_id").notNull(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),

    idempotencyKey: text("idempotency_key").notNull(),

    requestSha256: text("request_sha256").notNull(),

    status: evidenceUploadStatus("status").notNull().default("processing"),

    // A request processor must own a current lease.
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
    }),

    attempt: integer("attempt").notNull().default(1),

    // Set only after media + link are persisted.
    mediaId: uuid("media_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One idempotency key per user, per organization.
    unique("evidence_upload_requests_scope_key_uq").on(
      t.organizationId,
      t.userId,
      t.idempotencyKey,
    ),

    // The referenced observation must belong to the same org.
    foreignKey({
      name: "evidence_upload_requests_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }),

    // Completed uploads must reference media in the same org.
    foreignKey({
      name: "evidence_upload_requests_media_org_fk",
      columns: [t.mediaId, t.organizationId],
      foreignColumns: [evidenceMedia.id, evidenceMedia.organizationId],
    }),

    index("evidence_upload_requests_lease_idx").on(t.status, t.leaseExpiresAt),

    check(
      "evidence_upload_requests_key_ck",
      sql`${t.idempotencyKey} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$'`,
    ),

    check(
      "evidence_upload_requests_fingerprint_ck",
      sql`${t.requestSha256} ~ '^[0-9a-f]{64}$'`,
    ),

    check("evidence_upload_requests_attempt_ck", sql`${t.attempt} > 0`),

    // The row must be in a structurally valid state.
    check(
      "evidence_upload_requests_state_ck",
      sql`(
        (
          ${t.status} = 'processing'
          AND ${t.mediaId} IS NULL
          AND ${t.leaseToken} IS NOT NULL
          AND ${t.leaseExpiresAt} IS NOT NULL
        )
        OR
        (
          ${t.status} = 'completed'
          AND ${t.mediaId} IS NOT NULL
          AND ${t.leaseToken} IS NULL
          AND ${t.leaseExpiresAt} IS NULL
        )
        OR
        (
          ${t.status} = 'failed'
          AND ${t.mediaId} IS NULL
          AND ${t.leaseToken} IS NULL
          AND ${t.leaseExpiresAt} IS NULL
        )
      )`,
    ),
  ],
);
/** AB-WC-013 — immutable Task state transitions; generated migration required. */
export const taskTransitionEvents = pgTable(
  "task_transition_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    taskId: uuid("task_id").notNull(),
    transitionId: text("transition_id").notNull(),
    fromStatus: taskWorkflowStatus("from_status").notNull(),
    toStatus: taskWorkflowStatus("to_status").notNull(),
    fromVersion: integer("from_version").notNull(),
    toVersion: integer("to_version").notNull(),
    requestId: uuid("request_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "task_transition_events_task_org_fk",
      columns: [t.taskId, t.organizationId],
      foreignColumns: [domainTasks.id, domainTasks.organizationId],
    }),
    unique("task_transition_events_id_org_uq").on(t.id, t.organizationId),
    unique("task_transition_events_task_version_uk").on(t.taskId, t.toVersion),
    unique("task_transition_events_task_request_uk").on(t.taskId, t.requestId),
    check(
      "task_transition_events_version_ck",
      sql`${t.fromVersion} > 0 AND ${t.toVersion} = ${t.fromVersion} + 1`,
    ),
    check(
      "task_transition_events_reason_ck",
      sql`length(btrim(${t.reason})) >= 10 AND length(${t.reason}) <= 2000`,
    ),
    check(
      "task_transition_events_approved_edge_ck",
      sql`(
      (${t.transitionId} = 'AB-TR-024' AND ${t.fromStatus} = 'assigned' AND ${t.toStatus} = 'accepted') OR
      (${t.transitionId} = 'AB-TR-025' AND ${t.fromStatus} = 'accepted' AND ${t.toStatus} = 'in_progress') OR
      (${t.transitionId} = 'AB-TR-026' AND ${t.fromStatus} = 'in_progress' AND ${t.toStatus} = 'blocked') OR
      (${t.transitionId} = 'AB-TR-027' AND ${t.fromStatus} = 'blocked' AND ${t.toStatus} = 'in_progress') OR
      (${t.transitionId} = 'AB-TR-028' AND ${t.fromStatus} = 'in_progress' AND ${t.toStatus} = 'submitted') OR
      (${t.transitionId} = 'AB-TR-029' AND ${t.fromStatus} = 'submitted' AND ${t.toStatus} = 'completed') OR
      (${t.transitionId} = 'AB-TR-030' AND ${t.fromStatus} = 'submitted' AND ${t.toStatus} = 'in_progress') OR
      (${t.transitionId} = 'AB-TR-031' AND ${t.fromStatus} = 'assigned' AND ${t.toStatus} = 'cancelled') OR
      (${t.transitionId} = 'AB-TR-032' AND ${t.fromStatus} = 'in_progress' AND ${t.toStatus} = 'cancelled') OR
      (${t.transitionId} = 'AB-TR-033' AND ${t.fromStatus} = 'blocked' AND ${t.toStatus} = 'cancelled')
    )`,
    ),
  ],
);
