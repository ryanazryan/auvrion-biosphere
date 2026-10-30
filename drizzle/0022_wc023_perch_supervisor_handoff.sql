-- Store unverified model output with exact observation/evidence provenance.
-- No AI result may update observation quality or assert a species sighting.
CREATE TABLE "bioacoustic_analysis_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "observation_id" uuid NOT NULL,
  "media_id" uuid NOT NULL,
  "audio_sha256" text NOT NULL,
  "model_id" text NOT NULL,
  "model_version" text NOT NULL,
  "result" jsonb NOT NULL,
  "analyzed_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bioacoustic_analysis_snapshots_hash_ck" CHECK ("audio_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "bioacoustic_analysis_snapshots_result_ck" CHECK (jsonb_typeof("result") = 'object'),
  CONSTRAINT "bioacoustic_analysis_snapshots_org_obs_fk" FOREIGN KEY ("observation_id", "organization_id") REFERENCES "public"."observations"("id", "organization_id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "bioacoustic_analysis_snapshots_latest_idx" ON "bioacoustic_analysis_snapshots"("organization_id", "observation_id", "analyzed_at" DESC, "id" DESC);
