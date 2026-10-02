CREATE TYPE "public"."website_platform" AS ENUM('wordpress', 'webflow', 'framer', 'squarespace', 'shopify', 'custom_code', 'other');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('english', 'spanish');--> statement-breakpoint
ALTER TABLE "business_prompt_settings" ADD COLUMN "assistant_language" "language" DEFAULT 'english' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "website_platform" "website_platform" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "website_platform" "website_platform" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "onboarding_language" "language" DEFAULT 'english' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD COLUMN "assistant_language" "language" DEFAULT 'english' NOT NULL;
