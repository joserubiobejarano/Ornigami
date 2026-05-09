# Database and Migrations

The canonical schema for LocalLift lives in `neon/migrations`.

## Migration order

Apply migrations in this exact order:

1. `001_initial.sql`
2. `002_auto_reply_profiles.sql`
3. `003_business_foundation.sql`
4. `004_review_booster_tables.sql`
5. `005_business_agent_billing_fields.sql`

## Schema overview

### Identity and profile

- `users`
- `profiles`

### Billing and plans

- `subscriptions`
- `user_billing`
- `v_user_plan` (view)

### Review and reputation operations

- `reviews`
- `review_replies`
- `gbp_connections`
- `gbp_locations`
- `automation_prefs`

### Growth and intake

- `projects`
- `leads`
- `feedback`

### Business model layer

- `businesses`
- `business_members`
- `business_agents`

### Review Booster domain

- `followup_visits`
- `followup_messages`
- `followup_integration_events`

## Important behavior

- `business_agents` controls feature activation by business and agent id.
- Review Booster cron endpoint selects only `business_agents` where:
  - `agent_id = 'review_booster'`
  - `status = 'active'`
- CSV dedupe for follow-up visits is enforced by unique index on business/email/service/date combination for `source = 'csv'`.

## Operational guidance

- Apply migrations before running new features in any environment.
- Never split schema truth across multiple folders; use only `neon/migrations`.
- If importing legacy data, map all user-related references to `public.users.id`.
