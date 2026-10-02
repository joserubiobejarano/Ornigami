-- Messaging Quality + Guardrails migration (safe to run multiple times)
ALTER TABLE "business_prompt_settings"
ADD COLUMN IF NOT EXISTS "offered_services" jsonb;

ALTER TABLE "business_prompt_settings"
ADD COLUMN IF NOT EXISTS "not_offered_services" jsonb;
