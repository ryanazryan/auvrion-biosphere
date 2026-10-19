CREATE TYPE "public"."evidence_upload_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "evidence_upload_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_sha256" text NOT NULL,
	"status" "evidence_upload_status" DEFAULT 'processing' NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempt" integer DEFAULT 1 NOT NULL,
	"media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_upload_requests_scope_key_uq" UNIQUE("organization_id","user_id","idempotency_key"),
	CONSTRAINT "evidence_upload_requests_key_ck" CHECK ("evidence_upload_requests"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$'),
	CONSTRAINT "evidence_upload_requests_fingerprint_ck" CHECK ("evidence_upload_requests"."request_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_upload_requests_attempt_ck" CHECK ("evidence_upload_requests"."attempt" > 0),
	CONSTRAINT "evidence_upload_requests_state_ck" CHECK ((
        (
          "evidence_upload_requests"."status" = 'processing'
          AND "evidence_upload_requests"."media_id" IS NULL
          AND "evidence_upload_requests"."lease_token" IS NOT NULL
          AND "evidence_upload_requests"."lease_expires_at" IS NOT NULL
        )
        OR
        (
          "evidence_upload_requests"."status" = 'completed'
          AND "evidence_upload_requests"."media_id" IS NOT NULL
          AND "evidence_upload_requests"."lease_token" IS NULL
          AND "evidence_upload_requests"."lease_expires_at" IS NULL
        )
        OR
        (
          "evidence_upload_requests"."status" = 'failed'
          AND "evidence_upload_requests"."media_id" IS NULL
          AND "evidence_upload_requests"."lease_token" IS NULL
          AND "evidence_upload_requests"."lease_expires_at" IS NULL
        )
      ))
);
--> statement-breakpoint
ALTER TABLE "evidence_upload_requests" ADD CONSTRAINT "evidence_upload_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_upload_requests" ADD CONSTRAINT "evidence_upload_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_upload_requests" ADD CONSTRAINT "evidence_upload_requests_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_upload_requests" ADD CONSTRAINT "evidence_upload_requests_media_org_fk" FOREIGN KEY ("media_id","organization_id") REFERENCES "public"."evidence_media"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_upload_requests_lease_idx" ON "evidence_upload_requests" USING btree ("status","lease_expires_at");