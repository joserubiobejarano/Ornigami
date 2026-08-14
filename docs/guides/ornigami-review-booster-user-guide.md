# Ornigami Review Booster User Guide

Review Booster helps a local business ask customers for a Google review after a completed visit.

## How it works

1. Add a completed visit manually or by CSV.
2. Ornigami waits until the visit is eligible.
3. It generates and sends a friendly email through Resend.
4. The customer follows the tracked review link, and the visit/message state is recorded.

## Before you begin

You need:

- an Ornigami account;
- an active Review Booster or Complete plan;
- a verified sender mailbox/domain;
- a Google review link, or a connected Google Business Profile location;
- a process for recording completed visits.

Google Business Profile connection is optional for Review Booster. If it is unavailable or still awaiting external API approval, paste a direct Google Maps `Write a review` link in settings.

## First setup

1. Open **Billing** and activate Review Booster or Complete.
2. Open **Dashboard → Review Booster → Settings**.
3. Complete business name, business type, city, tone, language, sender name, and Google review URL.
4. Use **New visit** for one visit or **Upload CSV** for a batch.
5. Click **Run follow-ups now**, or let the scheduled job process eligible visits.

## CSV fields and limits

Required columns:

- `customer_name`
- `customer_email`
- `service_received` or `service_name`
- `visited_at`

CSV uploads are limited to 1 MB and 500 rows. Duplicate CSV records are skipped using business, normalized email, service, visit date, and CSV source.

## Send timing and statuses

The current runner selects visits that are between 23 hours and seven days old. Failed sends use bounded retries and backoff. Monthly allowances are enforced by plan: Review Booster allows up to 500 requests and Complete up to 1,500 requests per billing period.

- `pending` — waiting for an eligible run.
- `sent` — email delivered to Resend successfully.
- `failed` — the attempt failed; the dashboard shows the latest reason when available.
- `skipped` — intentionally not sent, for example duplicate, unsubscribed, already sent, or plan limit.

## Best practices

- Test the review link before sending a live batch.
- Add visits soon after the service, but expect the 23-hour wait window.
- Upload only customers who should receive the follow-up.
- Check failed rows and correct settings or email configuration before retrying.
- Use a verified sending domain as volume grows.

## Review Booster and Review Replies together

Review Booster helps generate more review volume. Review Replies helps respond to the reviews that arrive. They are separate agents connected through the same business workspace.

## FAQ

### Do I need Google Business Profile connected?

No. A manually entered Google review URL is enough for Review Booster. GBP connection is required for the Google review syncing/reply workflow.

### Can I use an existing customer system?

Yes. Export completed visits and map them to the CSV fields.

### What happens when a customer unsubscribes?

The unsubscribe link records suppression for that customer email and business. Future pending follow-ups for that customer are skipped.

### What does the public demo do?

The public Review Booster demo sends a sample email preview to the tester. It does not create a business, visit, subscription, or scheduled automation.
