CREATE TABLE "report_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"report_version_id" uuid NOT NULL,
	"observation_id" uuid,
	"case_id" uuid,
	"task_id" uuid,
	"input_version" integer NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_inputs_observation_revision_uq" UNIQUE("report_version_id","observation_id","input_version"),
	CONSTRAINT "report_inputs_case_revision_uq" UNIQUE("report_version_id","case_id","input_version"),
	CONSTRAINT "report_inputs_task_revision_uq" UNIQUE("report_version_id","task_id","input_version"),
	CONSTRAINT "report_inputs_one_target_ck" CHECK (num_nonnulls("report_inputs"."observation_id", "report_inputs"."case_id", "report_inputs"."task_id") = 1),
	CONSTRAINT "report_inputs_version_positive_ck" CHECK ("report_inputs"."input_version" > 0),
	CONSTRAINT "report_inputs_snapshot_object_ck" CHECK (jsonb_typeof("report_inputs"."input_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "report_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"timezone" text DEFAULT 'Asia/Makassar' NOT NULL,
	"scope_hash" text NOT NULL,
	"scope_snapshot" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"counts" jsonb,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_by_user_id" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "report_versions_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "report_versions_revision_uq" UNIQUE("organization_id","local_day","timezone","scope_hash","revision"),
	CONSTRAINT "report_versions_revision_positive_ck" CHECK ("report_versions"."revision" > 0),
	CONSTRAINT "report_versions_timezone_ck" CHECK ("report_versions"."timezone" = 'Asia/Makassar'),
	CONSTRAINT "report_versions_scope_hash_ck" CHECK ("report_versions"."scope_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_versions_scope_object_ck" CHECK (jsonb_typeof("report_versions"."scope_snapshot") = 'object'),
	CONSTRAINT "report_versions_counts_object_ck" CHECK ("report_versions"."counts" IS NULL OR jsonb_typeof("report_versions"."counts") = 'object'),
	CONSTRAINT "report_versions_limitations_array_ck" CHECK (jsonb_typeof("report_versions"."limitations") = 'array'),
	CONSTRAINT "report_versions_publication_order_ck" CHECK ("report_versions"."superseded_at" IS NULL OR ("report_versions"."published_at" IS NOT NULL AND "report_versions"."superseded_at" >= "report_versions"."published_at"))
);
--> statement-breakpoint
ALTER TABLE "report_inputs" ADD CONSTRAINT "report_inputs_report_org_fk" FOREIGN KEY ("report_version_id","organization_id") REFERENCES "public"."report_versions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_inputs" ADD CONSTRAINT "report_inputs_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_inputs" ADD CONSTRAINT "report_inputs_case_org_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."domain_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_inputs" ADD CONSTRAINT "report_inputs_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."domain_tasks"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_versions_one_current_published_uq" ON "report_versions" USING btree ("organization_id","local_day","timezone","scope_hash") WHERE "report_versions"."published_at" IS NOT NULL AND "report_versions"."superseded_at" IS NULL;