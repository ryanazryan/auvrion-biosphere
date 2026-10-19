CREATE TYPE "public"."observation_ingestion_mode" AS ENUM('live', 'historical', 'simulation');--> statement-breakpoint
CREATE TYPE "public"."observation_domain" AS ENUM('biodiversity', 'environmental_risk');--> statement-breakpoint
CREATE TYPE "public"."observation_quality_flag" AS ENUM('unreviewed', 'valid', 'suspect', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."observation_source_kind" AS ENUM('manual', 'listen_device', 'prevent_device', 'visual_device', 'external_provider');--> statement-breakpoint
CREATE TABLE "case_observation_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"linked_by_user_id" text NOT NULL,
	"link_reason" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone,
	"unlinked_by_user_id" text,
	CONSTRAINT "case_observation_reason_ck" CHECK (length(btrim("case_observation_links"."link_reason")) > 0),
	CONSTRAINT "case_observation_unlink_ck" CHECK ("case_observation_links"."unlinked_at" IS NULL OR ("case_observation_links"."unlinked_by_user_id" IS NOT NULL AND "case_observation_links"."unlinked_at" >= "case_observation_links"."linked_at"))
);
--> statement-breakpoint
CREATE TABLE "domain_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"opened_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_cases_version_ck" CHECK ("domain_cases"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ecosystem_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ecosystem_kind" text DEFAULT 'unknown' NOT NULL,
	"soil_kind" text DEFAULT 'unknown' NOT NULL,
	"hydrological_context" text DEFAULT 'unknown' NOT NULL,
	"reference_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environmental_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"measured_value" numeric(16, 6) NOT NULL,
	"unit" text NOT NULL,
	"quality" "observation_quality_flag" DEFAULT 'unreviewed' NOT NULL,
	"measured_at" timestamp with time zone,
	"calibration_ref" text,
	CONSTRAINT "environmental_measurement_nonempty_kind_ck" CHECK (length(btrim("environmental_measurements"."kind")) > 0),
	CONSTRAINT "environmental_measurement_nonempty_unit_ck" CHECK (length(btrim("environmental_measurements"."unit")) > 0)
);
--> statement-breakpoint
CREATE TABLE "observation_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"original_identifier" text,
	"acquisition_method" text NOT NULL,
	"attribution" text,
	"license_note" text,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_provenance_observation_id_unique" UNIQUE("observation_id"),
	CONSTRAINT "observation_provenance_method_ck" CHECK (length(btrim("observation_provenance"."acquisition_method")) > 0)
);
--> statement-breakpoint
CREATE TABLE "observation_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "observation_source_kind" NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"provider_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"domain" "observation_domain" NOT NULL,
	"ingestion_mode" "observation_ingestion_mode" NOT NULL,
	"source_record_id" text,
	"observed_at" timestamp with time zone,
	"unknown_observed_time_reason" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"location_unknown_reason" text,
	"quality" "observation_quality_flag" DEFAULT 'unreviewed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "observations_lat_range_ck" CHECK ("observations"."latitude" IS NULL OR ("observations"."latitude" >= -90 AND "observations"."latitude" <= 90)),
	CONSTRAINT "observations_lon_range_ck" CHECK ("observations"."longitude" IS NULL OR ("observations"."longitude" >= -180 AND "observations"."longitude" <= 180)),
	CONSTRAINT "observations_location_pair_ck" CHECK (("observations"."latitude" IS NULL) = ("observations"."longitude" IS NULL)),
	CONSTRAINT "observations_observed_reason_ck" CHECK ("observations"."observed_at" IS NOT NULL OR nullif(btrim("observations"."unknown_observed_time_reason"), '') IS NOT NULL),
	CONSTRAINT "observations_location_reason_ck" CHECK ("observations"."latitude" IS NOT NULL OR nullif(btrim("observations"."location_unknown_reason"), '') IS NOT NULL),
	CONSTRAINT "observations_version_ck" CHECK ("observations"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "domain_cases_id_org_uk" ON "domain_cases" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observation_sources_id_org_uk" ON "observation_sources" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observations_id_org_uk" ON "observations" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "case_observation_links" ADD CONSTRAINT "case_observation_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_observation_links" ADD CONSTRAINT "case_observation_links_linked_by_user_id_user_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_observation_links" ADD CONSTRAINT "case_observation_links_unlinked_by_user_id_user_id_fk" FOREIGN KEY ("unlinked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_observation_links" ADD CONSTRAINT "case_observation_links_case_org_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."domain_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_observation_links" ADD CONSTRAINT "case_observation_links_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_cases" ADD CONSTRAINT "domain_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_cases" ADD CONSTRAINT "domain_cases_opened_by_user_id_user_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem_profiles" ADD CONSTRAINT "ecosystem_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environmental_measurements" ADD CONSTRAINT "environmental_measurements_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_provenance" ADD CONSTRAINT "observation_provenance_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_sources" ADD CONSTRAINT "observation_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_org_fk" FOREIGN KEY ("source_id","organization_id") REFERENCES "public"."observation_sources"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_observation_active_observation_uk" ON "case_observation_links" USING btree ("observation_id") WHERE "case_observation_links"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "case_observation_active_pair_uk" ON "case_observation_links" USING btree ("case_id","observation_id") WHERE "case_observation_links"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "environmental_measurements_observation_idx" ON "environmental_measurements" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observation_sources_org_code_uk" ON "observation_sources" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "observations_source_record_uk" ON "observations" USING btree ("source_id","source_record_id") WHERE "observations"."source_record_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "observations_org_received_idx" ON "observations" USING btree ("organization_id","received_at");