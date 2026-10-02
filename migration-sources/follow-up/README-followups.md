# Post-Visit Follow-Up Agent MVP

## Required environment variables

```
DATABASE_URL=
OPENAI_API_KEY=
RESEND_API_KEY=
EMAIL_FROM=
APP_BASE_URL=
CRON_SECRET=
FOLLOWUP_ADMIN_USER=
FOLLOWUP_ADMIN_PASSWORD=
BOOKING_WEBHOOK_SECRET=
```

## SQL migration command

Run this against Neon Postgres:

```bash
psql "$DATABASE_URL" -f db/migrations/001_post_visit_followup_agent.sql
```

## Local testing flow

1. Save business settings in `/dashboard/followups/settings`.
2. Add one visit in `/dashboard/followups/new` with `visited_at` around 24 hours ago.
3. Open `/dashboard/followups` to confirm it appears as `pending`.
4. Trigger cron manually (below).
5. Refresh dashboard and verify status becomes `sent` or `failed`.

## Follow-up timing behavior

- Automatic integrations (`square`, `opentable`, `fresha`, `webhook`, `api`) send around 24 hours after visit (`visited_at` between 23 and 25 hours ago).
- Manual and CSV imports (`manual`, `csv`) can still send when the visit is older than 23 hours and up to 7 days old, as long as it is still pending and unsent.

## Manual cron test with curl

```bash
curl -X POST "$APP_BASE_URL/api/cron/send-followups" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Windows PowerShell:

```powershell
curl -Method Post "$env:APP_BASE_URL/api/cron/send-followups" `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

## Dev SQL test note (manual/CSV backfill)

Use this SQL to quickly make a record eligible under manual/CSV logic:

```sql
update visits
set visited_at = now() - interval '2 days',
    source = 'csv',
    followup_status = 'pending',
    followup_sent_at = null
where id = '<id>';
```

## CSV example

Use [`examples/visits-example.csv`](./examples/visits-example.csv).

Expected columns:

```
customer_name, customer_email, customer_phone, service_name, visited_at
```

## Vercel deployment checklist

1. Add all required environment variables in Vercel Project Settings.
   - `FOLLOWUP_ADMIN_USER` and `FOLLOWUP_ADMIN_PASSWORD` protect the standalone dashboard and follow-up APIs with HTTP Basic Auth.
   - `BOOKING_WEBHOOK_SECRET` must be sent as `x-booking-webhook-secret` by booking integrations.
2. Confirm migration ran on your Neon production database.
3. Confirm `vercel.json` is committed with hourly cron schedule.
4. Deploy and test `/api/cron/send-followups` with bearer token once.
5. Verify a sent follow-up appears in `followup_messages`.
