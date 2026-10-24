/** AB-WC-017 Slice 03B: device-attributed immutable private WAV receipts. */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { observationSources, observations } from "./observation-domain-schema";
import { ingestionDevices } from "./wc017-device-persistence-schema";

export const ingestionRecordings = pgTable(
  "ingestion_recordings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    observationId: uuid("observation_id").notNull(),
    recordingId: text("recording_id").notNull(),
    requestSha256: text("request_sha256").notNull(),
    audioSha256: text("audio_sha256").notNull(),
    audioBytes: bigint("audio_bytes", { mode: "number" }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    storageKey: text("storage_key").notNull(),
    clockQuality: text("clock_quality").notNull(),
    declaredObservedAt: text("declared_observed_at"),
    ingestionMode: text("ingestion_mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: "ingestion_recordings_device_org_fk",
      columns: [t.deviceId, t.organizationId],
      foreignColumns: [ingestionDevices.id, ingestionDevices.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ingestion_recordings_source_org_fk",
      columns: [t.sourceId, t.organizationId],
      foreignColumns: [
        observationSources.id,
        observationSources.organizationId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "ingestion_recordings_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }).onDelete("restrict"),
    unique("ingestion_recordings_device_record_uq").on(
      t.deviceId,
      t.recordingId,
    ),
    unique("ingestion_recordings_observation_uq").on(t.observationId),
    unique("ingestion_recordings_org_storage_uq").on(
      t.organizationId,
      t.storageKey,
    ),
    index("ingestion_recordings_org_created_idx").on(
      t.organizationId,
      t.createdAt,
    ),
    check(
      "ingestion_recordings_id_ck",
      sql`length(${t.recordingId}) BETWEEN 1 AND 128 AND ${t.recordingId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'`,
    ),
    check(
      "ingestion_recordings_hash_ck",
      sql`${t.requestSha256} ~ '^[0-9a-f]{64}$' AND ${t.audioSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "ingestion_recordings_audio_ck",
      sql`${t.audioBytes} BETWEEN 44 AND 10485760 AND ${t.durationMs} BETWEEN 1 AND 30000`,
    ),
    check(
      "ingestion_recordings_clock_ck",
      sql`${t.clockQuality} IN ('rtc_verified','unverified')`,
    ),
    check(
      "ingestion_recordings_mode_ck",
      sql`${t.ingestionMode} IN ('live','historical','simulation')`,
    ),
    check(
      "ingestion_recordings_storage_key_ck",
      sql`${t.storageKey} ~ '^[0-9a-f-]{36}\\.wav$'`,
    ),
  ],
);
