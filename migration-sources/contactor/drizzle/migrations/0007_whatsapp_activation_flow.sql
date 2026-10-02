CREATE TYPE "public"."whatsapp_sender_status" AS ENUM('not_started', 'number_assigned', 'pending_approval', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_sender_status" "whatsapp_sender_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_display_name" varchar(120);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_business_category" varchar(120);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_activated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "businesses"
SET
  "whatsapp_sender_status" = 'approved',
  "whatsapp_activated_at" = COALESCE("whatsapp_activated_at", NOW())
WHERE "whatsapp_enabled" = true
  AND "twilio_phone_number" IS NOT NULL;--> statement-breakpoint
UPDATE "businesses"
SET
  "whatsapp_enabled" = false,
  "whatsapp_activated_at" = null
WHERE "whatsapp_sender_status" <> 'approved'
  OR "twilio_phone_number" IS NULL;
