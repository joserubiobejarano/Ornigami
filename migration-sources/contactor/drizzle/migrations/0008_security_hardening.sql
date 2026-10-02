ALTER TYPE "dashboard_user_role" ADD VALUE IF NOT EXISTS 'internal_admin';

ALTER TABLE "dashboard_users"
  ALTER COLUMN "business_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "dashboard_login_attempts" (
  "key_hash" varchar(64) PRIMARY KEY,
  "failures" varchar(10) NOT NULL DEFAULT '0',
  "window_started_at" timestamptz NOT NULL DEFAULT now(),
  "locked_until" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "form_rate_limits" (
  "key_hash" varchar(64) PRIMARY KEY,
  "hits" varchar(10) NOT NULL DEFAULT '0',
  "window_started_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
