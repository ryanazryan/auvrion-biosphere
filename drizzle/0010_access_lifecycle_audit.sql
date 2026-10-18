CREATE TYPE "public"."access_lifecycle_audit_action" AS ENUM('role_granted', 'role_changed', 'role_revoked', 'account_disabled');--> statement-breakpoint
CREATE TABLE "access_lifecycle_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"target_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" "access_lifecycle_audit_action" NOT NULL,
	"previous_role" "operational_role",
	"new_role" "operational_role",
	"previous_status" "user_access_status" NOT NULL,
	"new_status" "user_access_status" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_lifecycle_audit" ADD CONSTRAINT "access_lifecycle_audit_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_lifecycle_audit" ADD CONSTRAINT "access_lifecycle_audit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_lifecycle_audit" ADD CONSTRAINT "access_lifecycle_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_lifecycle_audit_target_idx" ON "access_lifecycle_audit" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "access_lifecycle_audit_actor_idx" ON "access_lifecycle_audit" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "access_lifecycle_audit_org_created_idx" ON "access_lifecycle_audit" USING btree ("organization_id","created_at");