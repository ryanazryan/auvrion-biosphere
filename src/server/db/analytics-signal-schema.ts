import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { observations } from "./observation-domain-schema";

/** Candidate acoustic/environmental signals, strictly separate from incident verdicts. */
export const observationSignalEvents = pgTable(
  "observation_signal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    observationId: uuid("observation_id").notNull(),
    requestId: uuid("request_id").notNull(),
    signalClass: text("signal_class").notNull(),
    evidenceOrigin: text("evidence_origin").notNull(),
    note: text("note").notNull(),
    calibratedProbability: numeric("calibrated_probability", {
      precision: 6,
      scale: 5,
    }),
    modelReference: text("model_reference"),
    audioSha256: text("audio_sha256"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    reviewStatus: text("review_status").notNull().default("unreviewed"),
    reviewNote: text("review_note"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "observation_signals_observation_org_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }),
    unique("observation_signals_request_uk").on(t.organizationId, t.requestId),
    unique("observation_signals_id_org_uk").on(t.id, t.organizationId),
    index("observation_signals_org_date_idx").on(t.organizationId, t.createdAt),
    index("observation_signals_observation_idx").on(t.observationId),
    check(
      "observation_signals_kind_ck",
      sql`${t.signalClass} IN ('fire_indicator','chainsaw_like','gunshot_like','human_activity','biodiversity_signal','unclassified')`,
    ),
    check(
      "observation_signals_origin_ck",
      sql`${t.evidenceOrigin} IN ('operator_assessment','trusted_model_output')`,
    ),
    check(
      "observation_signals_status_ck",
      sql`${t.reviewStatus} IN ('unreviewed','corroborated','rejected')`,
    ),
    check(
      "observation_signals_note_ck",
      sql`length(btrim(${t.note})) BETWEEN 20 AND 1500`,
    ),
    check(
      "observation_signals_score_ck",
      sql`${t.calibratedProbability} IS NULL OR (${t.calibratedProbability} >= 0 AND ${t.calibratedProbability} <= 1)`,
    ),
    check(
      "observation_signals_model_provenance_ck",
      sql`(${t.evidenceOrigin} = 'operator_assessment' AND ${t.createdByUserId} IS NOT NULL AND ${t.modelReference} IS NULL AND ${t.calibratedProbability} IS NULL AND ${t.audioSha256} IS NULL) OR (${t.evidenceOrigin} = 'trusted_model_output' AND ${t.modelReference} IS NOT NULL AND ${t.audioSha256} ~ '^[a-f0-9]{64}$')`,
    ),
    check(
      "observation_signals_review_ck",
      sql`(${t.reviewStatus} = 'unreviewed' AND ${t.reviewedByUserId} IS NULL AND ${t.reviewedAt} IS NULL AND ${t.reviewNote} IS NULL) OR (${t.reviewStatus} IN ('corroborated','rejected') AND ${t.reviewedByUserId} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL AND length(btrim(${t.reviewNote})) >= 20)`,
    ),
    check("observation_signals_version_ck", sql`${t.version} >= 1`),
  ],
);
