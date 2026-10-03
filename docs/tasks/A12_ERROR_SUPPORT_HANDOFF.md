# A12 error and support visibility handoff

Original delivery: isolated implementation proposal on `fix/a12-error-support-alerts`, based on `7801a43` in `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A12-error-support-alerts`. Its dependency manifests, shared schema, deployment settings and schedules were unchanged. A00 subsequently reviewed `95e21c5` with A01/A19, corrected shared browser initialization, and reconciled the roadmap; see [wave 6 integration evidence](./A00_WAVE6_INTEGRATION_REVIEW.md). The validation below remains the author's historical receipt; the combined candidate passes 450 tests.

## Work packages

- [Error boundaries and capture](./A12_ERROR_VISIBILITY.md): ordinary and root boundaries use the Next 16.3 `retry` contract, a self-contained root `html`/`body`, useful recovery and contact actions, and a Sentry helper that emits a fixed exception with tightly allowlisted metadata. It strips inherited Sentry scope/event fields and never passes the source exception.
- [Support review workflow](./A12_SUPPORT_VISIBILITY.md): the existing feedback route remains rate limited and logs a fixed error code. Contact copy describes persistence accurately. A read-only operator CLI fetches bounded pages from existing `public.feedback` using an explicitly provisioned `SUPPORT_DATABASE_URL` and writes a private local artifact. It adds no web inbox, feedback schema, or outbound email.
- [Cron alert transport and privacy observation](./A12_ALERT_PRIVACY_EVIDENCE.md): evidence handoff for the controlled Sentry event and the next already scheduled privacy run. See the existing [A12 operations contract](./A12_OPERATIONS_MONITORING.md) and [A12 privacy cleanup contract](./A12_PRIVACY_CLEANUP.md) for the implemented cron behavior. The cron was not rebuilt or manually invoked.

## Integration dependencies and proposals

- The runtime DSN is `NEXT_PUBLIC_SENTRY_DSN`, already present in the target environment. No new runtime variable, package dependency, shared setting, or migration is required by the error boundary. `SENTRY_OPTIONS` remains the source for the PII default.
- `instrumentation-client.ts` and error boundaries use the shared browser initializer in `src/lib/sentry-client.ts`. Public routes stay lazy, protected route transitions reuse the same client, and tracing samples only protected production paths. If a public boundary initializes the SDK, `beforeSend` allows only a reconstructed fixed boundary event, drops other public errors/transactions and breadcrumbs, and the BrowserSession integration is excluded. Protected routes retain ordinary error/breadcrumb capture. The inert legacy `sentry.client.config.ts` placeholder was removed; its options are applied by the shared initializer.
- The support CLI requires an operator-provisioned PostgreSQL credential limited to `SELECT` on `public.feedback`, delivered through the approved secret mechanism as `SUPPORT_DATABASE_URL`. The CLI intentionally does not fall back to `DATABASE_URL`. Confirm the reported host/database before each review. No application deployment secret is added by this branch.
- The support workflow stores messages for review and creates a local private artifact. It does not provide online staff access, assignment/status, automatic polling, or email delivery. Define an access model and shared storage contract before expanding it into a web inbox. Decide separately whether future follow-up email needs an approved durable outbox.
- The controlled Sentry probe's ingest/readback receipt proves event acceptance and visibility through the project API. The legacy project issue-rules request returned 404; the current organization workflow endpoint returned 403, so no rule/action/recipient state was verified. The available token needs authorized workflow access such as `alerts:read` or `org:read` (or another documented sufficient scope) before that read-only check can be repeated. Ingest/readback do not prove that downstream operator notifications fired.
- The shared initializer removes the duplicate-client race between public boundary capture and protected-route instrumentation while retaining the existing protected-route transition callback.

## Unresolved acceptance

- Observe the already configured Vercel privacy run on **2026-10-04 03:00 UTC / 05:00 Europe/Madrid** and verify its durable run/checkpoint and resulting privacy-alert resolution. This is observation of the existing schedule; no cron rebuild or manual cleanup run is part of this work. The latest main-checkout snapshot at 2026-10-03 16:40:55 UTC confirmed a read-only transaction but not deployment identity; it showed no privacy state row or runs, one active `never_run` alert, and one `alert_transport_failed` attempt. The scheduled run remains pending.
- The separate alert-delivery lane sent one controlled fixed Sentry event. Ingest returned HTTP 200; the event was later read back and matched at 2026-10-03 16:22:25.766 UTC. The legacy project issue-rules endpoint returned 404 and the current organization workflow endpoint returned 403. Rule configuration and recipient delivery remain unverified pending authorized read access. Boundary tests here use a mocked SDK and do not establish production boundary capture.
- Provision and verify the support operator's read-only database credential and intended target before using the local inbox. Decide artifact cleanup practice and whether a durable acknowledgement workflow is needed.
## Validation status

- The first default-parallel full run reported 417 tests: 414 passed and 3 failed with Windows `EBUSY` cleanup errors in unchanged A11 PostgreSQL suites. The affected A11 suite passed 3/3 when rerun serially. The clean serial full suite then passed **419/419 tests with zero failures or skips** in 347,457 ms on Node 22.23.3:

  ```text
  node --experimental-strip-types --test --test-concurrency=1 <all sorted tests/*.test.mts files>
  ```

  The serial run is recorded in `build/a12-validation/tests-serial.log`. This resolves the Windows parallel cleanup failure for this validation run; it does not replace required Linux CI.
- Combined `tsc --noEmit` passed. Full lint passed with zero errors and four pre-existing navigation warnings. Production build and `npm run test:build` passed with dummy configuration, no dotenv file, and no live credentials.
- Focused offline suites passed: alert/probe/observer 14/14, error boundary 4/4, and support visibility 5/5. These use mocks and local artifacts; they do not represent live delivery or a scheduled run. Separate controlled Sentry and read-only database evidence, with their limits, is recorded above. The implementation is ready for integration. The October 4 scheduled privacy observation, Linux CI, workflow/recipient verification, and final integration review remain pending. No deployment or merge to `main` is authorized by this branch.
