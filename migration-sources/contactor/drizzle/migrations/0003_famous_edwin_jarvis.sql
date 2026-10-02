CREATE TYPE "public"."onboarding_business_type" AS ENUM('dental_clinic', 'gym', 'restaurant', 'aesthetic_clinic', 'salon', 'other');--> statement-breakpoint
CREATE TYPE "public"."onboarding_lead_channel" AS ENUM('whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."onboarding_pricing_mode" AS ENUM('exact', 'starting_at', 'varies', 'do_not_discuss');--> statement-breakpoint
CREATE TYPE "public"."onboarding_request_status" AS ENUM('new', 'reviewed', 'configured', 'archived');--> statement-breakpoint
CREATE TYPE "public"."onboarding_tone" AS ENUM('professional', 'warm', 'direct');--> statement-breakpoint
CREATE TABLE "onboarding_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "onboarding_request_status" DEFAULT 'new' NOT NULL,
	"business_name" varchar(200) NOT NULL,
	"business_type" "onboarding_business_type" NOT NULL,
	"website_url" varchar(500),
	"city" varchar(120),
	"contact_name" varchar(200) NOT NULL,
	"contact_email" varchar(255) NOT NULL,
	"owner_notification_email" varchar(255),
	"owner_notification_whatsapp" varchar(40),
	"preferred_lead_channel" "onboarding_lead_channel" DEFAULT 'whatsapp' NOT NULL,
	"preferred_owner_notification_channels" jsonb NOT NULL,
	"services_offered" jsonb NOT NULL,
	"services_not_offered" jsonb,
	"pricing_mode" "onboarding_pricing_mode" NOT NULL,
	"service_pricing" jsonb,
	"qualification_fields" jsonb NOT NULL,
	"urgency_rules" text,
	"tone_of_voice" "onboarding_tone" DEFAULT 'professional' NOT NULL,
	"faq_notes" text,
	"do_not_say" text,
	"additional_notes" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_prompt_settings" ADD COLUMN "offered_services" jsonb;--> statement-breakpoint
ALTER TABLE "business_prompt_settings" ADD COLUMN "not_offered_services" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notification_whatsapp" varchar(40);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notify_owner_via_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notify_owner_via_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notify_on_urgent" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notify_on_qualification_ready" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "notify_on_new_lead" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "onboarding_requests_status_idx" ON "onboarding_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "onboarding_requests_business_type_idx" ON "onboarding_requests" USING btree ("business_type");--> statement-breakpoint
CREATE INDEX "onboarding_requests_created_at_idx" ON "onboarding_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "onboarding_requests_contact_email_idx" ON "onboarding_requests" USING btree ("contact_email");
