# A10 / A16 integration review — 2026-10-04

A00 reviewed A10 `bcdaee4` and A16 `f8596fc`, including all handoff documents, against main `b4eedd5`. Original delivery commits are preserved in merge ancestry. These packages supply local acceptance and approval preparation; neither claims live provider completion.

## Findings and corrections

A10's new test runs the actual exported webhook handler and production database adapter against disposable loopback PostgreSQL, with synthetic raw-body signatures. It covers missing/incorrect secrets, tampering/stale timestamps, all seven outcomes, identical-ID replay and conflicting-ID content, out-of-order delivery, recipient mismatch, cross-owner suppression, preserved quota and positive evidence for an expired uncertain send without another attempt. The fixture reapplies 025 after 036 only in its disposable database. No migration is replayed in production.

A16's checker is offline, never exposes secret values and keeps all provider gates unverified. A00 found two local-readiness errors: an explicitly empty `AUTH_URL` was treated as absent despite the pinned Auth.js `AUTH_URL ?? NEXTAUTH_URL` precedence, and explicitly blank runtime secrets could appear ready through a fallback. The checker now reports those cases and two regressions include the installed Auth.js action-URL helper. No auth/application behavior was changed.

The combined TypeScript check also caught the checker's inferred `ProcessEnv` parameter requiring Next's augmented `NODE_ENV` in every fixture. An explicit optional environment-map API contract fixes that integration error without forcing callers to supply unrelated process variables.

The Resend secret/rotation guidance and Google eligibility/domain-owner guidance were compared with current official [Resend documentation](https://resend.com/changelog/headless-webhook-api), [Google prerequisites](https://developers.google.com/my-business/content/prereqs) and [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification). Google's qualifying profile can belong to a client; its verified/active age is distinct from how long the applicant has been Manager. A16's Console findings are dated author observations, not an independently repeated A00 Console inspection.

## Evidence and deployment gates

Isolated Windows Node 22.23.3 clean install passes. Focused tests pass **14/14**, including real disposable PostgreSQL; scoped lint passes. Full Ubuntu/Node 22 quality/security CI is required on the exact corrected candidate before main advances. Main CI, exact Vercel Ready/alias and public boundary smoke are verified after the authorized push. Sanitized exact-commit receipts are stored privately outside Git and the release result is reported to the user. No runtime source, dependency, migration, schedule, secret store or provider configuration changes are delivered in this wave.

Fresh Vercel production configuration and PostgreSQL CLI inspection at `2026-10-03T22:05:25.292Z` / October 4 00:05 Europe/Madrid verified the expected production database identity in a read-only transaction: eight users/businesses, existing 025/028 schema and 036 wrapper, zero instrumented privacy runs, no privacy state row, one `never_run` alert with one `alert_transport_failed` attempt. The first October 4 03:00 UTC / 05:00 Madrid privacy opportunity is still future relative to this receipt. No cleanup or authenticated health evaluation was invoked.

At `2026-10-03T22:07:26.964Z`, the production Resend credential's `GET /webhooks` returned HTTP 200, a complete list (`has_more=false`) and **zero endpoints**. Production `RESEND_WEBHOOK_SECRET` is absent. The offline Google checker reports local production configuration ready while every provider gate remains unverified. Account deletion and manual reconciliation remain disabled. No provider endpoint, secret, DNS, OAuth registration or account permission was changed; no email, charge or Google post was made.

## Remaining launch work and one next session

**A17 is the next consolidated acceptance session**, starting from reviewed current main. Reuse the merged A10 route/database test and A16 checker/runbook; do not rewrite or restart those packages. Record pass/fail/blocked for the enabled release scope, with a named prerequisite for each blocked row and narrow fixes only for actual defects.

- Resend configuration remains an operator/integration action: choose the authorized candidate deployment/database/account and controlled recipient, register the supported endpoint, deliver its signing secret through the intended environment secret store, then verify actual provider ingress, delivery, replay/suppression and owner lookup acceptance. The current production inventory is empty; local fixtures are not a substitute. Keep manual reconciliation closed until its specific acceptance is satisfied.
- Complete authenticated owner/member/browser/CSP, support operator access, Sentry notification and scheduled privacy checkpoint/alert acceptance. Observe the existing October 4 05:00 Madrid run without rebuilding cron or forcing cleanup. Retain the existing instruction to skip Stripe until the user changes that scope.
- A16 reports no qualifying client profile supplied and a user instruction to skip profile-dependent work. Google-dependent acceptance is blocked on an eligible client's access/permission plus API quota/approval and domain-owner/branding work. Preparation is complete; another A16 session cannot supply those missing external inputs. Use its packet when the account owner can proceed.
- A15 legacy retirement and A14 future lead work do not block the current Booster pilot. A18 policy decisions and A11 activation work remain separately gated; do not enable account deletion or invent retention rules in acceptance.

Only the [single roadmap](../ROADMAP.md) is the active backlog. This review is an evidence handoff, not another competing roadmap. Merging these preparations does not establish launch readiness or close live provider gates.
