CREATE TABLE "access_decision_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"previous_status" "access_application_status" NOT NULL,
	"new_status" "access_application_status" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_decision_audit" ADD CONSTRAINT "access_decision_audit_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_decision_audit" ADD CONSTRAINT "access_decision_audit_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_decision_audit" ADD CONSTRAINT "access_decision_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_decision_audit_application_unique" ON "access_decision_audit" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "access_decision_audit_actor_idx" ON "access_decision_audit" USING btree ("actor_user_id");