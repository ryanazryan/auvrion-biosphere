CREATE TYPE "public"."admin_capability" AS ENUM('review_applications', 'manage_access', 'manage_devices', 'manage_config');--> statement-breakpoint
CREATE TYPE "public"."operational_role" AS ENUM('operator', 'supervisor', 'ranger');--> statement-breakpoint
CREATE TABLE "admin_capability_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"capability" "admin_capability" NOT NULL,
	"granted_by_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" text
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "operational_role" NOT NULL,
	"granted_by_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" text
);
--> statement-breakpoint
ALTER TABLE "admin_capability_grants" ADD CONSTRAINT "admin_capability_grants_user_id_user_access_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_access"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_capability_grants" ADD CONSTRAINT "admin_capability_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_capability_grants" ADD CONSTRAINT "admin_capability_grants_granted_by_id_user_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_capability_grants" ADD CONSTRAINT "admin_capability_grants_revoked_by_id_user_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_user_id_user_access_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_access"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_granted_by_id_user_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_revoked_by_id_user_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_capability_grants_active_unique" ON "admin_capability_grants" USING btree ("user_id","organization_id","capability") WHERE "admin_capability_grants"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_grants_active_unique" ON "role_grants" USING btree ("user_id","organization_id","role") WHERE "role_grants"."revoked_at" is null;