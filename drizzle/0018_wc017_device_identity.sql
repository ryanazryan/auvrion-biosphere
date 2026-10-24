CREATE TABLE "ingestion_device_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"credential_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_user_id" text,
	CONSTRAINT "ingestion_credentials_device_generation_uq" UNIQUE("device_id","generation"),
	CONSTRAINT "ingestion_credentials_generation_ck" CHECK ("ingestion_device_credentials"."generation" > 0),
	CONSTRAINT "ingestion_credentials_retirement_ck" CHECK (("ingestion_device_credentials"."retired_at" IS NULL) = ("ingestion_device_credentials"."retired_by_user_id" IS NULL)),
	CONSTRAINT "ingestion_credentials_time_ck" CHECK ("ingestion_device_credentials"."retired_at" IS NULL OR "ingestion_device_credentials"."retired_at" >= "ingestion_device_credentials"."created_at")
);
--> statement-breakpoint
CREATE TABLE "ingestion_device_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_version" integer,
	"to_version" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_events_device_version_uq" UNIQUE("device_id","to_version"),
	CONSTRAINT "ingestion_events_type_ck" CHECK ("ingestion_device_events"."event_type" IN ('provisioned', 'credential_rotated', 'device_revoked')),
	CONSTRAINT "ingestion_events_version_ck" CHECK (("ingestion_device_events"."event_type" = 'provisioned' AND "ingestion_device_events"."from_version" IS NULL AND "ingestion_device_events"."to_version" = 1)
        OR ("ingestion_device_events"."event_type" <> 'provisioned' AND "ingestion_device_events"."from_version" > 0 AND "ingestion_device_events"."to_version" = "ingestion_device_events"."from_version" + 1))
);
--> statement-breakpoint
CREATE TABLE "ingestion_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"credential_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	CONSTRAINT "ingestion_devices_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "ingestion_devices_source_uq" UNIQUE("source_id"),
	CONSTRAINT "ingestion_devices_status_ck" CHECK ("ingestion_devices"."status" IN ('active', 'revoked')),
	CONSTRAINT "ingestion_devices_version_ck" CHECK ("ingestion_devices"."credential_version" > 0),
	CONSTRAINT "ingestion_devices_revocation_ck" CHECK (("ingestion_devices"."status" = 'revoked') = ("ingestion_devices"."revoked_at" IS NOT NULL)),
	CONSTRAINT "ingestion_devices_revoked_actor_ck" CHECK (("ingestion_devices"."revoked_at" IS NULL) = ("ingestion_devices"."revoked_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "ingestion_device_credentials" ADD CONSTRAINT "ingestion_device_credentials_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_device_credentials" ADD CONSTRAINT "ingestion_device_credentials_retired_by_user_id_user_id_fk" FOREIGN KEY ("retired_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_device_credentials" ADD CONSTRAINT "ingestion_credentials_device_org_fk" FOREIGN KEY ("device_id","organization_id") REFERENCES "public"."ingestion_devices"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_device_events" ADD CONSTRAINT "ingestion_device_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_device_events" ADD CONSTRAINT "ingestion_events_device_org_fk" FOREIGN KEY ("device_id","organization_id") REFERENCES "public"."ingestion_devices"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_devices" ADD CONSTRAINT "ingestion_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_devices" ADD CONSTRAINT "ingestion_devices_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_devices" ADD CONSTRAINT "ingestion_devices_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_devices" ADD CONSTRAINT "ingestion_devices_source_org_fk" FOREIGN KEY ("source_id","organization_id") REFERENCES "public"."observation_sources"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_credentials_one_active_uq" ON "ingestion_device_credentials" USING btree ("device_id") WHERE "ingestion_device_credentials"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ingestion_credentials_org_idx" ON "ingestion_device_credentials" USING btree ("organization_id","device_id");--> statement-breakpoint
CREATE INDEX "ingestion_events_org_created_idx" ON "ingestion_device_events" USING btree ("organization_id","created_at");