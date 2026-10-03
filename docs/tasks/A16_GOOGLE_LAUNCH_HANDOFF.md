# A16 — Google launch handoff

**Branch:** `ops/google-launch-approval`
**Baseline:** `b4eedd5`
**Isolated worktree:** `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A16-google-launch-approval`
**Evidence date:** 2026-10-03

## Result

A16 prepared an offline OAuth configuration checker and refreshed the Google Business Profile approval guidance. It did not submit an access request, change Google Cloud or Search Console settings, deploy code, or perform a real-provider test. Google approval, API availability, and Review Replies launch readiness remain open.

The project Console was inspected on 2026-10-03: project `local-lift-477812` (`Local-Lift`), project number `1002660087913`, is selected. My Business Account Management API and My Business Business Information API are enabled, but each reports **Requests per minute: 0**. Google My Business API is absent from the enabled API inventory. This is current project evidence for the observation date; recheck before acting on it. No API request was submitted.

## OAuth and branding evidence

The consent screen is **External** and **In production**. Its Data Access screen lists `business.manage` under **non-sensitive scopes**; the sensitive and restricted scope tables are empty. Verification Center says **data-access verification is not required for the current scope**. This does not grant Business Profile API access or quota.

The matching Ornigami Web OAuth client showed these registered redirect URIs:

```text
https://ornigami.com/api/auth/callback/google
https://ornigami.com/api/google/oauth/callback
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/google/oauth/callback
```

Both production callbacks are the expected targets for the Auth.js sign-in route and the Business Profile OAuth route. The Business Profile callback helper derives its URI from `getServerAppUrl()`, which reads `NEXT_PUBLIC_APP_URL` (or falls back to `http://localhost:3000`). Auth.js resolves its base URL through its configured `AUTH_URL`/`NEXTAUTH_URL` behavior or request inference under `trustHost`; it has its own standard Google callback path. The checker treats those Auth.js variables as alignment hints and derives the Business Profile callback from the actual app helper. Local configuration and mocks cannot prove the registrations or deployed behavior.

Branding showed the Ornigami home page, privacy policy, terms, support/developer contact fields, and `ornigami.com` authorized domain. The check did not establish that support/developer contacts align with the public app's support or sender configuration; the application packet leaves contact/legal details for an authorized operator to verify. Branding verification failed because Google says the `https://ornigami.com` home page is not registered to the account's name (English rendering of the Spanish UI message). Verify `ornigami.com` ownership through Search Console using a **verified or delegated Search Console Owner**, then associate that same Google Account with this Cloud project as an **Owner or Editor**. Search Console Full or Restricted users do not meet the requirement. Wait 24 hours before retrying Branding verification. Root's signed-in Search Console property selector did not list `ornigami.com`; this only establishes that it was unavailable in that account's selector, not that the domain is unverified globally or that no other account has access. No property was created and no DNS or Console settings were changed.

## Eligibility and explicit boundary

There is no active real client Business Profile available for this work. The user directed that profile-dependent implementation, submission, and live tests be skipped. Ornigami is online-only; do not create a synthetic Ornigami profile. A real client profile must be verified and active for at least 60 days, the applicant must currently have Manager access, and the client must separately authorize any controlled live test. Until a profile is available, the Basic API Access form is not submitted and live OAuth, discovery, sync, draft, reply-post, cron, and derived Review Booster URL tests remain blocked.

No Google client secret or token was copied from another checkout. Console and Search Console inspections were read-only; no Business Profile API calls or provider mutations were performed. Do not commit client names, profile identifiers, emails, screenshots, tokens, or raw provider payloads.

## Local implementation and review

The task adds a read-only checker at [`scripts/a16-google-readiness.mjs`](../../scripts/a16-google-readiness.mjs), focused offline tests at [`tests/a16-google-readiness.test.mts`](../../tests/a16-google-readiness.test.mts), preparation notes at [`A16_OAUTH_CONFIGURATION.md`](./A16_OAUTH_CONFIGURATION.md), and the operating sequence at [`GOOGLE_BUSINESS_PROFILE_RUNBOOK.md`](../GOOGLE_BUSINESS_PROFILE_RUNBOOK.md). The approval form response draft is maintained separately in [`A16_GOOGLE_APPROVAL_PACKET.md`](./A16_GOOGLE_APPROVAL_PACKET.md).

The checker reads process environment values only. It does not load `.env` files, access the network, or infer provider approval from local settings. Its output keeps provider gates `unverified`, omits secret values, and distinguishes runtime-derived callback URIs from Console registration evidence. It has no new package dependency. The runbook now links to the checker and states that it validates only local configuration.

Independent review on Node `v24.11.1` passed `node --test tests/a16-google-readiness.test.mts` (**11/11**), `node --check scripts/a16-google-readiness.mjs`, CLI `--help`, and `git diff --check`. Root's link check also passed across the A16 documents. The suite covers Windows CLI invocation, missing-configuration exit status, secret omission, malformed URL sanitization including dot-segment and delimiter cases, production URL rules, secret fallbacks, and expected callback derivation. Review confirmed Auth.js's expected callback registration and URL-hint behavior are described separately from the Business Profile helper using `NEXT_PUBLIC_APP_URL`. These checks establish only local tool behavior, not Google approval or deployed Auth.js host behavior. No full application build was needed: A16 adds no application/runtime changes, dependency, or shared route.

## Shared integration requests for A00

The local tool does not require shared routes, models, settings, deployment configuration, or dependencies. The runbook now links to the checker and describes its limits. A00 may consider these additional documentation updates; this handoff does not claim they were applied:

- Add the checker command to the deployment checklist as local configuration evidence only; never let a checker pass close a Google gate.
- Keep `NEXT_PUBLIC_APP_URL` as the Business Profile callback source in environment guidance. Document Auth.js base URL configuration separately from the Business Profile callback helper.
- Document the Search Console owner-verification step and the 24-hour wait before retrying Branding verification. Do not create a property, change DNS, or edit Console settings as part of this handoff.
- Keep provider evidence dated and attributable in the runbook/checklist. The roadmap and shared deployment configuration remain owned by A00.

## Remaining gates and dependencies

1. Confirm which applicant Google Account and client profile qualify; receive client permission and an accepted Manager invite. The checked account's selector did not show the domain, and no client profile was made available for A16.
2. Choose an authorized ownership path for `ornigami.com`, grant the applicant Google Account verified or delegated Search Console Owner access, associate that same account with the Cloud project as Owner or Editor, wait 24 hours, and retry Branding. Search Console Full/Restricted access is insufficient.
3. Verify the actual support/developer email, legal applicant name, and other business/contact details against current authorized records and the product's public support/sender configuration. The current audit only established that the Console fields were populated.
4. Submit Basic API Access for project `local-lift-477812` / project number `1002660087913`, then retain Google's decision. Confirm required APIs are available/enabled and record nonzero per-API quotas.
5. Reconfirm the deployed OAuth client and credential pairing, publication state, callbacks, and current Verification Center status.
6. With explicit client authorization, select the controlled review/reply target and have A17 perform real-provider acceptance in coordination with A08/A09. Verify OAuth, discovery, sync, draft preservation, one specifically approved reply, scheduled draft behavior, and Review Booster URL derivation.

No gate above is closed by this local implementation. API access approval, profile eligibility, branding verification, and a client's consent are separate dependencies.
