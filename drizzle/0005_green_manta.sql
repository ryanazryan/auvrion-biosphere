CREATE TABLE "mfa_session_assurance" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mfa_session_assurance" ADD CONSTRAINT "mfa_session_assurance_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_session_assurance" ADD CONSTRAINT "mfa_session_assurance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mfa_session_assurance_user_id_idx" ON "mfa_session_assurance" USING btree ("user_id");