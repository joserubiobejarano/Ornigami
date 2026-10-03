# A12 error visibility handoff

The route and root error boundaries now report a deliberately sanitized Sentry event, show a retry action, and offer a direct path to the existing contact form. Fallback copy no longer says that anyone was notified. The root boundary renders its own `html` and `body`, as required because it replaces the root layout.

`src/lib/error-visibility.ts` owns boundary capture. It lazily imports the browser SDK, initializes it on public routes when `NEXT_PUBLIC_SENTRY_DSN` is present and no SDK client exists, and reads the existing `SENTRY_OPTIONS` so the `sendDefaultPii: false` setting remains shared. A boundary error is deduplicated by object identity. Sentry receives a new fixed-message error, a fixed boundary label, and an optional decimal-only Next digest (1–20 digits) for correlation. A scoped event processor and `beforeSend` reconstruct this event from fixed exception text, allowlisted tags/fingerprint, and standard envelope metadata; malformed boundary-tagged events are dropped. Public automatic exceptions, transactions and breadcrumbs are dropped, and BrowserSession is excluded so a public boundary does not emit session envelopes. Protected routes retain ordinary error and breadcrumb capture, and their production trace sampling remains 0.1. The source exception is never passed to Sentry.

## Integration dependencies and decisions

- The existing `NEXT_PUBLIC_SENTRY_DSN` runtime variable is required for event delivery. No environment variable, dependency, shared setting, model, route, or migration is added by this change.
- `instrumentation-client.ts` and the boundary helper use the shared initializer in `src/lib/sentry-client.ts`. This coalesces concurrent initialization, reuses an existing client, and keeps browser initialization lazy on public routes. Its sampler returns zero for public routes and nonproduction environments, and retains the existing 0.1 rate for protected production routes. Public SDK events are filtered even if a public boundary initializes the client first; router transition capture remains in `instrumentation-client.ts`.
- The contact page and feedback route already exist. Boundary fallback only points users to that form and does not promise a response or that an operator has received an alert. The separate read-only operator review workflow is described in [A12 support visibility](./A12_SUPPORT_VISIBILITY.md); it does not deliver notifications.
- This boundary work sent no live Sentry event. The separate alert and privacy evidence lane is documented in [A12 alert/privacy evidence](./A12_ALERT_PRIVACY_EVIDENCE.md); it covers any controlled event sent for cron-alert transport verification. Project-side alert routing and authenticated end-to-end boundary capture remain A17/release acceptance work. This error-boundary task did not invoke or observe the scheduled privacy-retention run.

## Validation

`tests/a12-error-visibility.test.mts` mocks the Sentry SDK. It verifies that the capture excludes source exception strings/properties and contaminated scope data (user, request URL/cookies, breadcrumbs, contexts, extras, and transaction), sends only the fixed exception plus safe tags/fingerprint, deduplicates the same error, and does not initialize without a DSN. It also renders the actual root fallback to confirm document tags and support links, invokes its retry handler, and checks for absence of a notification claim.

On Node 22.23.3, the focused test command passed 4/4 tests:

```text
node --experimental-strip-types --test tests/a12-error-visibility.test.mts
```

The clean serial full suite passed 419/419 tests with zero failures or skips on Node 22.23.3. Combined `tsc --noEmit` passed; full lint passed with zero errors and four pre-existing navigation warnings. The production build and local production smoke also passed with dummy configuration and no dotenv file or live credentials. These boundary tests use a mocked SDK and rendered local components; they do not send an event or access a database. Separate alert-delivery evidence, including one controlled live event, is recorded in [A12 alert/privacy evidence](./A12_ALERT_PRIVACY_EVIDENCE.md). No deployment, cron invocation, or shared Sentry configuration was used or changed for this slice.
