CREATE TABLE "account_activation_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"issued_by_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_activation_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "account_activation_invites" ADD CONSTRAINT "account_activation_invites_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activation_invites" ADD CONSTRAINT "account_activation_invites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activation_invites" ADD CONSTRAINT "account_activation_invites_issued_by_id_user_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_activation_invites_application_unique" ON "account_activation_invites" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_activation_invites_user_unique" ON "account_activation_invites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_activation_invites_expires_idx" ON "account_activation_invites" USING btree ("expires_at");