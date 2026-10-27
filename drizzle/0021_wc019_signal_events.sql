CREATE TABLE "observation_signal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"signal_class" text NOT NULL,
	"evidence_origin" text NOT NULL,
	"note" text NOT NULL,
	"calibrated_probability" numeric(6, 5),
	"model_reference" text,
	"audio_sha256" text,
	"created_by_user_id" text,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"review_note" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_signals_request_uk" UNIQUE("organization_id","request_id"),
	CONSTRAINT "observation_signals_id_org_uk" UNIQUE("id","organization_id"),
	CONSTRAINT "observation_signals_kind_ck" CHECK ("observation_signal_events"."signal_class" IN ('fire_indicator','chainsaw_like','gunshot_like','human_activity','biodiversity_signal','unclassified')),
	CONSTRAINT "observation_signals_origin_ck" CHECK ("observation_signal_events"."evidence_origin" IN ('operator_assessment','trusted_model_output')),
	CONSTRAINT "observation_signals_status_ck" CHECK ("observation_signal_events"."review_status" IN ('unreviewed','corroborated','rejected')),
	CONSTRAINT "observation_signals_note_ck" CHECK (length(btrim("observation_signal_events"."note")) BETWEEN 20 AND 1500),
	CONSTRAINT "observation_signals_score_ck" CHECK ("observation_signal_events"."calibrated_probability" IS NULL OR ("observation_signal_events"."calibrated_probability" >= 0 AND "observation_signal_events"."calibrated_probability" <= 1)),
	CONSTRAINT "observation_signals_model_provenance_ck" CHECK (("observation_signal_events"."evidence_origin" = 'operator_assessment' AND "observation_signal_events"."created_by_user_id" IS NOT NULL AND "observation_signal_events"."model_reference" IS NULL AND "observation_signal_events"."calibrated_probability" IS NULL AND "observation_signal_events"."audio_sha256" IS NULL) OR ("observation_signal_events"."evidence_origin" = 'trusted_model_output' AND "observation_signal_events"."model_reference" IS NOT NULL AND "observation_signal_events"."audio_sha256" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "observation_signals_review_ck" CHECK (("observation_signal_events"."review_status" = 'unreviewed' AND "observation_signal_events"."reviewed_by_user_id" IS NULL AND "observation_signal_events"."reviewed_at" IS NULL AND "observation_signal_events"."review_note" IS NULL) OR ("observation_signal_events"."review_status" IN ('corroborated','rejected') AND "observation_signal_events"."reviewed_by_user_id" IS NOT NULL AND "observation_signal_events"."reviewed_at" IS NOT NULL AND length(btrim("observation_signal_events"."review_note")) >= 20)),
	CONSTRAINT "observation_signals_version_ck" CHECK ("observation_signal_events"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "observation_signal_events" ADD CONSTRAINT "observation_signal_events_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_signal_events" ADD CONSTRAINT "observation_signal_events_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_signal_events" ADD CONSTRAINT "observation_signals_observation_org_fk" FOREIGN KEY ("observation_id","organization_id") REFERENCES "public"."observations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "observation_signals_org_date_idx" ON "observation_signal_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "observation_signals_observation_idx" ON "observation_signal_events" USING btree ("observation_id");