ALTER TABLE "onboarding_requests" ADD COLUMN "reviewed_payload" jsonb;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "configured_business_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "configured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_configured_business_id_businesses_id_fk" FOREIGN KEY ("configured_business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_requests_configured_business_id_idx" ON "onboarding_requests" USING btree ("configured_business_id");
