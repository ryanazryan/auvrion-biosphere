CREATE TABLE "access_status_recovery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_status_recovery_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "access_status_recovery_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "access_status_recovery" ADD CONSTRAINT "access_status_recovery_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE cascade ON UPDATE no action;