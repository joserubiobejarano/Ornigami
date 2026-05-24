# Ornigami User Guide

This guide is written for new users and non-technical teams.

## What Ornigami helps you do

Ornigami helps local businesses manage customer reviews with simple AI agents.

The two most important agents today are:

- Review Booster: helps you ask more customers for Google reviews after a completed visit
- Review Replies: helps you reply faster to reviews that come into your Google Business Profile

## The easiest way to explain Review Booster

Review Booster works like this:

1. You finish a customer visit.
2. You add that visit to Ornigami manually or by CSV.
3. Ornigami sends a friendly follow-up email asking the customer to leave a Google review.
4. You track what was sent, what is still pending, and what needs attention.

## What you need before you begin

- An Ornigami account
- An active Review Booster subscription
- A Google review link
- A business email setup that can send outbound messages through Resend
- A simple process for recording completed visits

Note: if you connect Google Business Profile, Ornigami can usually pull the review link automatically. If not, you can paste the link manually in Review Booster settings.

## Your first setup in 5 steps

### Step 1: Sign in and open Billing

Go to the dashboard and open `Billing & subscriptions`.

Activate `Review Booster`.

### Step 2: Open Review Booster Settings

Go to:

- `Dashboard`
- `Review Booster`
- `Settings`

Complete these fields:

- Business name
- Business type
- Google review URL
- Tone
- Language

### Step 3: Connect Google Business Profile if you want auto-fill help

This step is optional, but recommended.

If connected, Ornigami can help find the correct review link from your synced Google locations.

### Step 4: Start adding completed visits

You can do this in two ways:

- Add visits one by one
- Upload a CSV file for many visits at once

### Step 5: Run follow-ups

Use `Run follow-ups now` to send emails to eligible customers.

Your team can also schedule regular runs through the cron endpoint if you want a more automated setup.

## Two ways to use Review Booster

### Option A: Manual daily workflow

Best for:

- small teams
- lower visit volume
- teams that want more control

Typical routine:

1. Add completed visits during the day
2. Review your dashboard
3. Click `Run follow-ups now`
4. Check which visits are marked `sent`, `pending`, or `failed`

### Option B: CSV upload workflow

Best for:

- clinics
- salons
- gyms
- service teams with many daily visits

Typical routine:

1. Export completed visits from your existing system
2. Match the Ornigami CSV template
3. Upload the file
4. Review results
5. Run follow-ups

## CSV template fields

Current expected fields:

- `customer_name`
- `customer_email`
- `service_received` or `service_name`
- `visited_at`

Use a real customer email and a valid visit date.

## What the statuses mean

- `pending`: the visit is waiting to be processed
- `sent`: the follow-up email was sent
- `failed`: the send attempt did not complete successfully
- `skipped`: the visit was intentionally not sent, usually because it was a duplicate or already handled

## Best practices for better results

- Add visits soon after the appointment or service
- Make sure the Google review link is correct
- Use a warm, human tone
- Only upload real completed visits
- Make sure customers have agreed to receive follow-up emails
- Check failures regularly so you can fix settings quickly

## When to also use Review Replies

Review Booster helps you get more reviews.

Review Replies helps you answer those reviews faster.

Together they create a simple loop:

1. Review Booster helps generate more review volume
2. Review Replies helps you stay responsive and professional
3. Your business looks more active and trusted on Google

## Simple FAQ

### Do I need Google Business Profile connected?

No. You can still use Review Booster if you paste your review link manually.

### Can I start with a small team?

Yes. Manual visit entry works well for smaller businesses.

### What if I already track visits in another system?

Use the CSV upload flow. It is the easiest way to import many visits at once.

### What if a send fails?

Check your Review Booster settings, your sending setup, and your review link, then run again after the issue is fixed.

## A good first-week goal

If you are onboarding a new customer, a simple goal is:

- activate Review Booster
- save settings
- add 10 to 20 recent visits
- run the first follow-up batch
- confirm emails are sending correctly

That is enough for a team to understand the product and start seeing value quickly.
