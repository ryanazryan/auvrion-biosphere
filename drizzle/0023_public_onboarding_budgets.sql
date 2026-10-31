-- Shared fixed-window budgets for public onboarding.
-- Bucket keys are HMAC-SHA256; never store raw IPs or applicant addresses here.
CREATE TABLE "onboarding_rate_limit_buckets" (
  "bucket_key" text PRIMARY KEY NOT NULL,
  "window_start" timestamp with time zone DEFAULT now() NOT NULL,
  "hits" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_rate_limit_buckets_hits_ck" CHECK ("hits" >= 0)
);
--> statement-breakpoint
CREATE INDEX "onboarding_rate_limit_buckets_updated_idx" ON "onboarding_rate_limit_buckets" ("updated_at");
