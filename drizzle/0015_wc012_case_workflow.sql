CREATE TYPE "public"."case_workflow_status" AS ENUM('received', 'under_review', 'awaiting_decision', 'monitoring', 'assigned');--> statement-breakpoint
CREATE TYPE "public"."task_workflow_status" AS ENUM('assigned', 'accepted', 'in_progress', 'blocked', 'submitted', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "case_transition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"transition_id" text NOT NULL,
	"from_status" "case_workflow_status" NOT NULL,
	"to_status" "case_workflow_status" NOT NULL,
	"from_version" integer NOT NULL,
	"to_version" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_transition_events_case_version_uk" UNIQUE("case_id","to_version"),
	CONSTRAINT "case_transition_events_case_request_uk" UNIQUE("case_id","request_id"),
	CONSTRAINT "case_transition_events_reason_ck" CHECK (length(btrim("case_transition_events"."reason")) > 0 AND length("case_transition_events"."reason") <= 2000),
	CONSTRAINT "case_transition_events_version_ck" CHECK ("case_transition_events"."from_version" > 0 AND "case_transition_events"."to_version" = "case_transition_events"."from_version" + 1),
	CONSTRAINT "case_transition_events_approved_edges_ck" CHECK ((
        ("case_transition_events"."transition_id" = 'AB-TR-010' AND "case_transition_events"."from_status" = 'received' AND "case_transition_events"."to_status" = 'under_review' AND "case_transition_events"."task_id" IS NULL)
        OR ("case_transition_events"."transition_id" = 'AB-TR-011' AND "case_transition_events"."from_status" = 'under_review' AND "case_transition_events"."to_status" = 'awaiting_decision' AND "case_transition_events"."task_id" IS NULL)
        OR ("case_transition_events"."transition_id" = 'AB-TR-012' AND "case_transition_events"."from_status" = 'awaiting_decision' AND "case_transition_events"."to_status" = 'monitoring' AND "case_transition_events"."task_id" IS NULL)
        OR ("case_transition_events"."transition_id" = 'AB-TR-013' AND "case_transition_events"."from_status" = 'awaiting_decision' AND "case_transition_events"."to_status" = 'assigned' AND "case_transition_events"."task_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "domain_cases" ADD COLUMN "status" "case_workflow_status" DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_tasks" ADD COLUMN "status" "task_workflow_status" DEFAULT 'assigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_tasks" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "domain_tasks" ADD COLUMN "safety_notes" text;--> statement-breakpoint
ALTER TABLE "case_transition_events" ADD CONSTRAINT "case_transition_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_transition_events" ADD CONSTRAINT "case_transition_events_case_org_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."domain_cases"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_transition_events" ADD CONSTRAINT "case_transition_events_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."domain_tasks"("id","organization_id") ON DELETE no action ON UPDATE no action;