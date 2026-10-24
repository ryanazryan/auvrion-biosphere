CREATE TABLE "ingestion_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"recording_id" text NOT NULL,
	"request_sha256" text NOT NULL,
	"audio_sha256" text NOT NULL,
	"audio_bytes" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"storage_key" text NOT NULL,
	"clock_quality" text NOT NULL,
	"declared_observed_at" text,
	"ingestion_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_recordings_device_record_uq" UNIQUE("device_id","recording_id"),
	CONSTRAINT "ingestion_recordings_observation_uq" UNIQUE("observation_id"),
	CONSTRAINT "ingestion_recordings_org_storage_uq" UNIQUE("organization_id","storage_key"),
	CONSTRAINT "ingestion_recordings_id_ck" CHECK (length("ingestion_recordings"."recording_id") BETWEEN 1 AND 128 AND "ingestion_recordings"."recording_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "ingestion_recordings_hash_ck" CHECK ("ingestion_recordings"."request_sha256" ~ '^[0-9a-f]{64}$' AND "ingestion_recordings"."audio_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ingestion_recordings_audio_ck" CHECK ("ingestion_recordings"."audio_bytes" BETWEEN 44 AND 10485760 AND "ingestion_recordings"."duration_ms" BETWEEN 1 AND 30000),
	CONSTRAINT "ingestion_recordings_clock_ck" CHECK ("ingestion_recordings"."clock_quality" IN ('rtc_verified','unverified')),
	CONSTRAINT "ingestion_recordings_mode_ck" CHECK ("ingestion_recordings"."ingestion_mode" IN ('live','historical','simulation')),
	CONSTRAINT "ingestion_recordings_storage_key_ck" CHECK ("ingestion_recordings"."storage_key" ~ '^[0-9a-f-]{36}\.wav$')
);
--> statement-breakpoint
ALTER TABLE "ingestion_recordings" ADD CONSTRAINT "ingestion_recordings_device_org_fk" FOREIGN KEY ("device_id","organization_id") REFERENCES "public"."ingestion_devices"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_recordings" ADD CONSTRAINT "ingestion_recordings_source_org_fk" FOREIGN KEY ("source_id","organization_id") REFERENCES "public"."observation_sources"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_recordings" ADD CONSTRAINT "ingestion_recordings_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_recordings_org_created_idx" ON "ingestion_recordings" USING btree ("organization_id","created_at");