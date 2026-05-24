# Smoke Test Checklist

Use this checklist after a deployment or after major changes.

## Pre-test

- [ ] Use a clean browser session or incognito window
- [ ] Open browser console and network tab
- [ ] Confirm the environment URL under test
- [ ] Confirm required env vars are set in that environment

## 1. Public site

- [ ] `/` loads without console errors
- [ ] Header links work
- [ ] Pricing page loads
- [ ] Review Booster marketing page loads
- [ ] Review Replies marketing page loads
- [ ] Login and signup links work

## 2. Authentication

### Credentials signup/login

- [ ] `/signup` loads
- [ ] A new account can be created
- [ ] Post-signup redirect lands in the dashboard
- [ ] `/login` loads
- [ ] Existing credentials login works

### Google sign-in

- [ ] Google sign-in button starts OAuth flow
- [ ] Callback returns to the app successfully
- [ ] Auth session is established

## 3. Dashboard shell

- [ ] `/dashboard` loads
- [ ] Business name renders when available
- [ ] Billing page loads
- [ ] Agent cards render with expected activation status

## 4. Review Replies flow

- [ ] `/settings` loads
- [ ] Reply settings can be saved
- [ ] Google Business Profile can connect
- [ ] Locations can sync
- [ ] `/reviews` loads
- [ ] Location selector works
- [ ] Review sync runs successfully
- [ ] Generate reply works
- [ ] Draft save works
- [ ] Post reply works when available
- [ ] Auto-reply toggle can be changed

## 5. Review Booster flow

- [ ] Billing page shows Review Booster activation state correctly
- [ ] `/dashboard/agents/review-booster` loads for an active business
- [ ] `/dashboard/agents/review-booster/settings` loads
- [ ] Review Booster settings save successfully
- [ ] Google review URL is resolved either from GBP or manual input
- [ ] Manual visit creation works
- [ ] CSV template downloads
- [ ] CSV upload succeeds for a valid file
- [ ] CSV validation errors are displayed for invalid rows
- [ ] Run-now endpoint processes eligible visits
- [ ] Visit statuses update after sending attempts

## 6. Billing and subscription lifecycle

- [ ] Stripe checkout starts from billing page
- [ ] Success redirect returns to dashboard billing
- [ ] Stripe portal opens for active subscriptions
- [ ] Webhook updates `profiles.plan_status`
- [ ] Webhook updates `business_agents.status`

## 7. Review Booster cron

- [ ] Calling `/api/cron/review-booster` without auth returns `401`
- [ ] Calling it with `Authorization: Bearer <CRON_SECRET>` succeeds
- [ ] Only active Review Booster businesses are scanned

## 8. Demo and legacy surfaces

- [ ] `/demo` loads
- [ ] Review demo pages still render
- [ ] Legacy `/content` page still renders if intentionally kept available
- [ ] Legacy `/audit` page still renders if intentionally kept available

## 9. Error handling

- [ ] Invalid route shows expected 404 behavior
- [ ] API validation errors return readable JSON
- [ ] No unexpected 500s appear in the network tab during normal flows

## 10. Responsive sanity check

- [ ] Public site is usable on mobile width
- [ ] Dashboard navigation is usable on mobile width
- [ ] Review Booster pages remain readable on mobile width

## 11. Release sign-off

- [ ] No blocking issues found
- [ ] Any non-blocking issues are documented
- [ ] Deployment is acceptable for internal review or customer use

## Notes

Document any issues found during the run here:

1. Issue:
2. Repro steps:
3. Expected:
4. Actual:
