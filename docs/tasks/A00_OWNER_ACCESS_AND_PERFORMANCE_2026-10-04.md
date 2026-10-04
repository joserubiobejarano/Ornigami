# Owner access and bounded production performance

October 4, 2026. Tested production source: `940bfdefffd28cda4607704d29c2489298d2f8e5`, deployment `dpl_AZiy7NiLCB6Q8EyjVmfySZ15YAoM`, `https://ornigami.com`. This follows [remaining launch tasks](./A00_REMAINING_LAUNCH_FOLLOWUPS.md) and supersedes its pending owner sign-in request. No completed broad agent session is reassigned.

## Account access resolved

The owner explicitly requested checking their exact email in the database, setting up access if necessary and signing in. Fresh private production configuration and the canonical database fingerprint were verified before access. The initial bounded read at 20:31 UTC found exactly one existing, verified, unfrozen account with no local password. Stored password hashes cannot supply a user's original password. No duplicate account was created.

Two supported Google sign-in form submissions returned HTTP 200 but did not complete browser authentication. Provider discovery returned Google and credentials. Cause is not established. A direct GET to the sign-in action is not the supported POST flow and its configuration-error page is not proof of a production configuration defect. Working credentials access does not close this Google sign-in observation or imply Business Profile approval.

At the owner's request, a generated strong password was added to that existing account through the database CLI. The transaction locked the exact-email account and required one verified, unfrozen match with a null password hash. It wrote a bcrypt-10 hash, incremented `auth_version` to 1 and required exactly one changed row before commit. The private provisioning receipt is timestamped 20:38:26 UTC. No other account, profile, plan, trial, billing state or entitlement changed. This is an operator credential setup, not proof of a password-recovery email delivery.

The password is retained only in a current-user-restricted LocalAppData credential artifact supplied privately to the owner. No password, hash, email, account identifier, session cookie or full environment is committed here. Temporary production configuration/runtime sources were removed. The normal credentials form successfully signed in to the existing account; no auth bypass or signed-token manufacture was used.

## Authenticated browser checks

Read-only navigation in the connected browser confirmed the following visible pages without alerts. No Run campaign, Generate, Post, plan activation or customer action was invoked.

| Entry | Browser destination | Visible heading |
| --- | --- | --- |
| Dashboard | `/dashboard` | Welcome back, there. |
| Booster | `/dashboard/agents/review-booster` | Keep the conversation going.; Recent visits |
| Settings alias | `/dashboard/agents/review-replies/settings` | Settings |
| Reviews alias | `/dashboard/agents/review-replies/reviews` | Your review inbox. |

The current Booster table had no data rows. This is current-account navigation evidence, not populated paid-workflow or representative customer-volume acceptance. Previously accepted isolated owner/member/outsider fixtures remain separate and closed.

## Bounded authenticated HTTP baseline

At 20:42 UTC, a fresh HTTP session authenticated through the normal CSRF/credentials/session endpoints using the owner's generated credential. The confirmed session belonged to the requested owner. Its in-memory cookie jar was not copied from the browser, printed or saved. Twelve sequential production page GETs were collected: three per route, without concurrency, throttling, seed data or customer/entitlement mutations.

| Entry | Response headers min / median / max (ms) | Full HTML min / median / max (ms) |
| --- | --- | --- |
| Dashboard | 453.1 / 675.2 / 843.2 | 1279.5 / 1692.1 / 1883.1 |
| Booster | 453.9 / 461.0 / 538.9 | 655.4 / 681.1 / 738.2 |
| Settings alias | 436.5 / 474.4 / 589.6 | 437.4 / 475.5 / 590.6 |
| Reviews alias | 432.8 / 491.7 / 541.2 | 526.3 / 583.5 / 634.8 |

All twelve returned HTTP 200, enforced CSP, `private, no-cache, no-store, max-age=0, must-revalidate` and edge cache MISS. These HTTP alias responses did not redirect; their browser client navigation destinations are listed above. The timings include network and server response work, not subsequent browser rendering or client navigation. They are not LCP/INP/CLS, Lighthouse, field p75, or representative load/SLO acceptance. The connected browser's read-only DOM surface does not expose Navigation Timing or PerformanceObserver. No hidden browser state or external browser automation was used to bypass that limitation. Existing Webpack artifact inventory remains accepted separately.

Private sanitized receipts are in `C:/Users/joser/Desktop/Projects/Ornigami-Backups/2026-10-04-remaining-launch`: `owner-auth-state.json`, `owner-password-provisioned.json` and `owner-authenticated-http-baseline.json`. The auth-state file reflects the post-provision read; the initial no-password observation is recorded above rather than presented as a fresh post-change query.

## Remaining finite gates

- Owner access and current-account production navigation/HTTP baseline are complete. Browser CWV/Lighthouse and representative-volume evidence remain distinct; the owner must accept explicit limits for the bounded pilot.
- Google account sign-in did not complete in the observed browser flow; diagnose that exact failure before requiring Google login. Credentials access works. Real Review Replies client/API approval remains a separate external gate.
- Independent GitHub health recovery [37232136864](https://github.com/joserubiobejarano/Ornigami/actions/runs/37232136864) passed manually at 20:27 UTC on exact source `940bfde`, with healthy true, no alerts and succeeded/no-work job summaries. A production health GET at 20:27:13 UTC correlated temporally with the dispatch; no shared caller ID was echoed. This does not prove natural scheduler delivery. The latest scheduled result checked at approximately 20:46 UTC remains [37221231299](https://github.com/joserubiobejarano/Ornigami/actions/runs/37221231299), the old 17:37 UTC failure. The fresh natural GitHub monitor receipt is still pending; accepted natural Vercel Booster/Replies runs are not reopened.
- The approved A12 temporary-child expiry is October 5 at 18:00 Madrid / 16:00 UTC. Verify removal after that deadline; do not claim future expiry is completed deletion.
- The owner requested the [pilot decisions](./A00_BOOSTER_PILOT_DECISION.md) after this task. Audience/dates, access/billing, handlers, mail/privacy/retention choices, accepted performance limits and launch/hold remain unapproved. No customer invitations or enrollment occurred.
- Stripe remains skipped. Deletion and uncertain-provider reconciliation remain disabled. No production migration, new application code, live charge, Google reply or email was required for this task.

This follow-through changes documentation only. Validate its diff and local links; application tests and provider acceptance already recorded for the unchanged source are not repeated locally.
