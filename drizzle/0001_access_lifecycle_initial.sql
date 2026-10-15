CREATE TYPE "public"."access_application_status" AS ENUM('submitted', 'email_verified', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_access_status" AS ENUM('pending_activation', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "access_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_name" text NOT NULL,
	"email" text NOT NULL,
	"status" "access_application_status" DEFAULT 'submitted' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "user_access_status" DEFAULT 'pending_activation' NOT NULL,
	"activated_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_access_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "access_applications" ADD CONSTRAINT "access_applications_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_applications_email_idx" ON "access_applications" USING btree ("email");--> statement-breakpoint
CREATE INDEX "access_applications_status_idx" ON "access_applications" USING btree ("status");