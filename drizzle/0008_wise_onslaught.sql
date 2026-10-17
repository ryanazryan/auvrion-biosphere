CREATE TYPE "public"."access_decision_notification_kind" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."access_decision_notification_status" AS ENUM('pending', 'processing', 'sent');--> statement-breakpoint
CREATE TABLE "access_decision_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "access_decision_notification_kind" NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text NOT NULL,
	"status" "access_decision_notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_decision_notifications_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "access_decision_notifications" ADD CONSTRAINT "access_decision_notifications_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_decision_notifications" ADD CONSTRAINT "access_decision_notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_decision_notifications_queue_idx" ON "access_decision_notifications" USING btree ("status","next_attempt_at");