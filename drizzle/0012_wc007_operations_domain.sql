CREATE TYPE "public"."evidence_availability" AS ENUM('uploading', 'available', 'failed', 'invalid');--> statement-breakpoint
CREATE TABLE "domain_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_tasks_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "domain_tasks_positive_version_ck" CHECK ("domain_tasks"."version" > 0),
	CONSTRAINT "domain_tasks_nonempty_title_ck" CHECK (length(btrim("domain_tasks"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"observation_id" uuid,
	"finding_id" uuid,
	"linked_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_links_one_target_ck" CHECK (num_nonnulls("evidence_links"."observation_id", "evidence_links"."finding_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "evidence_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"availability" "evidence_availability" DEFAULT 'uploading' NOT NULL,
	"sha256" text,
	"mime_type" text,
	"byte_length" bigint,
	"classification" text DEFAULT 'restricted_pending_policy' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_media_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "evidence_media_org_storage_uq" UNIQUE("organization_id","storage_key"),
	CONSTRAINT "evidence_media_key_ck" CHECK (length(btrim("evidence_media"."storage_key")) > 0 AND "evidence_media"."storage_key" !~* '^https?://'),
	CONSTRAINT "evidence_media_available_metadata_ck" CHECK ("evidence_media"."availability" <> 'available' OR ("evidence_media"."sha256" IS NOT NULL AND "evidence_media"."sha256" ~ '^[0-9a-fA-F]{64}$' AND "evidence_media"."mime_type" IS NOT NULL AND length(btrim("evidence_media"."mime_type")) > 0 AND "evidence_media"."byte_length" IS NOT NULL AND "evidence_media"."byte_length" > 0)),
	CONSTRAINT "evidence_media_length_ck" CHECK ("evidence_media"."byte_length" IS NULL OR "evidence_media"."byte_length" >= 0)
);
--> statement-breakpoint
CREATE TABLE "observation_zone_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"zone_geometry_version_id" uuid NOT NULL,
	"match_method" text NOT NULL,
	"matched_by_user_id" text,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_zone_matches_pair_uq" UNIQUE("observation_id","zone_geometry_version_id"),
	CONSTRAINT "observation_zone_matches_method_ck" CHECK ("observation_zone_matches"."match_method" IN ('covers', 'intersects', 'manual')),
	CONSTRAINT "observation_zone_matches_manual_actor_ck" CHECK ("observation_zone_matches"."match_method" <> 'manual' OR "observation_zone_matches"."matched_by_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "operational_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"precision_policy" text DEFAULT 'restricted_pending_policy' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_zones_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "operational_zones_code_org_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "operational_zones_code_nonempty_ck" CHECK (length(btrim("operational_zones"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"ranger_user_id" text NOT NULL,
	"assigned_by_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone,
	"unassigned_by_user_id" text,
	CONSTRAINT "task_assignments_reason_ck" CHECK (length(btrim("task_assignments"."reason")) > 0),
	CONSTRAINT "task_assignments_unassign_ck" CHECK ("task_assignments"."unassigned_at" IS NULL OR ("task_assignments"."unassigned_by_user_id" IS NOT NULL AND "task_assignments"."unassigned_at" >= "task_assignments"."assigned_at"))
);
--> statement-breakpoint
CREATE TABLE "task_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_findings_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "task_findings_summary_ck" CHECK (length(btrim("task_findings"."summary")) > 0)
);
--> statement-breakpoint
CREATE TABLE "zone_geometry_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"geometry_version" integer NOT NULL,
	"boundary" geometry(MultiPolygon,4326) NOT NULL,
	"reference_source" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_geometry_versions_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "zone_geometry_versions_number_uq" UNIQUE("zone_id","geometry_version"),
	CONSTRAINT "zone_geometry_versions_positive_ck" CHECK ("zone_geometry_versions"."geometry_version" > 0),
	CONSTRAINT "zone_geometry_versions_valid_ck" CHECK (ST_IsValid("zone_geometry_versions"."boundary") AND NOT ST_IsEmpty("zone_geometry_versions"."boundary"))
);
--> statement-breakpoint
ALTER TABLE "domain_tasks" ADD CONSTRAINT "domain_tasks_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_tasks" ADD CONSTRAINT "domain_tasks_case_org_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."domain_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_linked_by_user_id_user_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_media_org_fk" FOREIGN KEY ("media_id","organization_id") REFERENCES "public"."evidence_media"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_finding_org_fk" FOREIGN KEY ("finding_id","organization_id") REFERENCES "public"."task_findings"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_media" ADD CONSTRAINT "evidence_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_media" ADD CONSTRAINT "evidence_media_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_zone_matches" ADD CONSTRAINT "observation_zone_matches_matched_by_user_id_user_id_fk" FOREIGN KEY ("matched_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_zone_matches" ADD CONSTRAINT "observation_zone_matches_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_zone_matches" ADD CONSTRAINT "observation_zone_matches_geometry_org_fk" FOREIGN KEY ("zone_geometry_version_id","organization_id") REFERENCES "public"."zone_geometry_versions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_zones" ADD CONSTRAINT "operational_zones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_ranger_user_id_user_id_fk" FOREIGN KEY ("ranger_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_unassigned_by_user_id_user_id_fk" FOREIGN KEY ("unassigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."domain_tasks"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_findings" ADD CONSTRAINT "task_findings_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_findings" ADD CONSTRAINT "task_findings_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."domain_tasks"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_geometry_versions" ADD CONSTRAINT "zone_geometry_versions_zone_org_fk" FOREIGN KEY ("zone_id","organization_id") REFERENCES "public"."operational_zones"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_tasks_case_idx" ON "domain_tasks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_links_media_idx" ON "evidence_links" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignments_active_task_uk" ON "task_assignments" USING btree ("task_id") WHERE "task_assignments"."unassigned_at" IS NULL;--> statement-breakpoint
CREATE INDEX "zone_geometry_versions_boundary_gix" ON "zone_geometry_versions" USING gist ("boundary");