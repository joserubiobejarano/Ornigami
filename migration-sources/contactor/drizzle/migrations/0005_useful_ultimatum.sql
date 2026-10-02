CREATE TYPE "public"."dashboard_user_role" AS ENUM('owner');--> statement-breakpoint
CREATE TABLE "dashboard_user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"business_id" uuid NOT NULL,
	"role" "dashboard_user_role" DEFAULT 'owner' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "production_test_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dashboard_user_sessions" ADD CONSTRAINT "dashboard_user_sessions_user_id_dashboard_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dashboard_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_users" ADD CONSTRAINT "dashboard_users_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_user_sessions_token_hash_unique" ON "dashboard_user_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "dashboard_user_sessions_user_id_idx" ON "dashboard_user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_user_sessions_expires_at_idx" ON "dashboard_user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_users_email_unique" ON "dashboard_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_users_business_id_unique" ON "dashboard_users" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "dashboard_users_role_idx" ON "dashboard_users" USING btree ("role");
