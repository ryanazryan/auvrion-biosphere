/** Immutable, unverified Perch inference snapshots, bound to an observation + audio hash. */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { observations } from "./observation-domain-schema";

export const bioacousticAnalysisSnapshots = pgTable(
  "bioacoustic_analysis_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    observationId: uuid("observation_id").notNull(),
    mediaId: uuid("media_id").notNull(),
    audioSha256: text("audio_sha256").notNull(),
    modelId: text("model_id").notNull(),
    modelVersion: text("model_version").notNull(),
    result: jsonb("result").notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: "bioacoustic_analysis_snapshots_org_obs_fk",
      columns: [t.observationId, t.organizationId],
      foreignColumns: [observations.id, observations.organizationId],
    }).onDelete("restrict"),
    index("bioacoustic_analysis_snapshots_latest_idx").on(
      t.organizationId,
      t.observationId,
      t.analyzedAt.desc(),
      t.id.desc(),
    ),
    check(
      "bioacoustic_analysis_snapshots_hash_ck",
      sql`${t.audioSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "bioacoustic_analysis_snapshots_result_ck",
      sql`jsonb_typeof(${t.result}) = 'object'`,
    ),
  ],
);
