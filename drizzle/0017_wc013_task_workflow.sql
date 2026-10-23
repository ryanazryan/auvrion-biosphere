CREATE TABLE "task_transition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"transition_id" text NOT NULL,
	"from_status" "task_workflow_status" NOT NULL,
	"to_status" "task_workflow_status" NOT NULL,
	"from_version" integer NOT NULL,
	"to_version" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_transition_events_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "task_transition_events_task_version_uk" UNIQUE("task_id","to_version"),
	CONSTRAINT "task_transition_events_task_request_uk" UNIQUE("task_id","request_id"),
	CONSTRAINT "task_transition_events_version_ck" CHECK ("task_transition_events"."from_version" > 0 AND "task_transition_events"."to_version" = "task_transition_events"."from_version" + 1),
	CONSTRAINT "task_transition_events_reason_ck" CHECK (length(btrim("task_transition_events"."reason")) >= 10 AND length("task_transition_events"."reason") <= 2000),
	CONSTRAINT "task_transition_events_approved_edge_ck" CHECK ((
      ("task_transition_events"."transition_id" = 'AB-TR-024' AND "task_transition_events"."from_status" = 'assigned' AND "task_transition_events"."to_status" = 'accepted') OR
      ("task_transition_events"."transition_id" = 'AB-TR-025' AND "task_transition_events"."from_status" = 'accepted' AND "task_transition_events"."to_status" = 'in_progress') OR
      ("task_transition_events"."transition_id" = 'AB-TR-026' AND "task_transition_events"."from_status" = 'in_progress' AND "task_transition_events"."to_status" = 'blocked') OR
      ("task_transition_events"."transition_id" = 'AB-TR-027' AND "task_transition_events"."from_status" = 'blocked' AND "task_transition_events"."to_status" = 'in_progress') OR
      ("task_transition_events"."transition_id" = 'AB-TR-028' AND "task_transition_events"."from_status" = 'in_progress' AND "task_transition_events"."to_status" = 'submitted') OR
      ("task_transition_events"."transition_id" = 'AB-TR-029' AND "task_transition_events"."from_status" = 'submitted' AND "task_transition_events"."to_status" = 'completed') OR
      ("task_transition_events"."transition_id" = 'AB-TR-030' AND "task_transition_events"."from_status" = 'submitted' AND "task_transition_events"."to_status" = 'in_progress') OR
      ("task_transition_events"."transition_id" = 'AB-TR-031' AND "task_transition_events"."from_status" = 'assigned' AND "task_transition_events"."to_status" = 'cancelled') OR
      ("task_transition_events"."transition_id" = 'AB-TR-032' AND "task_transition_events"."from_status" = 'in_progress' AND "task_transition_events"."to_status" = 'cancelled') OR
      ("task_transition_events"."transition_id" = 'AB-TR-033' AND "task_transition_events"."from_status" = 'blocked' AND "task_transition_events"."to_status" = 'cancelled')
    ))
);
--> statement-breakpoint
ALTER TABLE "task_findings" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "task_transition_events" ADD CONSTRAINT "task_transition_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_transition_events" ADD CONSTRAINT "task_transition_events_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."domain_tasks"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_findings" ADD CONSTRAINT "task_findings_request_uk" UNIQUE("task_id","request_id");