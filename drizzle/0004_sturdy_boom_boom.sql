CREATE TABLE "access_email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_email_verification_tokens_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "access_email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "access_email_verification_tokens" ADD CONSTRAINT "access_email_verification_tokens_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_email_verification_expires_idx" ON "access_email_verification_tokens" USING btree ("expires_at");