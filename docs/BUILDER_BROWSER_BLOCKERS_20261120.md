# Builder browser blockers: attempt identity and client lifecycle

20 November 2026. Local source only; no deployment, customer message, real
provider call, paid call or publication. Default access stays closed and the
live provider stays disabled.

## Decision

Two reproduced browser defects at
`7b8674358d5421c589bea22f55167276f4d391ec` are fixed on the client:

1. **Generation identity.** The local monotonic request gate and the HTTP
   idempotency key are separate contracts. The gate keeps ordering responses
   inside one mounted editor; the HTTP key identifies one intentional
   generation attempt. Every new attempt gets a fresh `gen_<uuid>` key, so a
   reload, a remount through "Edit brief inputs" and a second tab sharing the
   session no longer collide on the first local sequence number. A retry of the
   same attempt may reuse that attempt's key and is still deduplicated by the
   server.
2. **Workspace teardown.** Sign-out, session expiry and account switching share
   one client lifecycle. It stops draft persistence before clearing storage,
   aborts pending generation and export work, blocks queued restore or persist
   effects, clears builder drafts in the current tab and asks other open tabs to
   clear theirs. A non-2xx or network failure from logout is treated as
   unconfirmed server revocation and shown as a retryable state.

The server route is unchanged. Session 2 owns
`builder-runtime/app/api/builder/generate/route.ts`; the existing server
contract already scopes the client key by subject and session and returns
`409 request_already_submitted` on replay.

## Generation attempt contract

`src/lib/campaign-lab/generation/generation-attempt.ts` exports
`createGenerationAttempt(localSequence)` returning a frozen
`{ localSequence, idempotencyKey }`:

- `localSequence` is the value from `GenerationRequestGate.begin()` and is used
  only for `isCurrent()` stale-response checks.
- `idempotencyKey` is `gen_` plus a UUID from `crypto.randomUUID()`, with a
  `crypto.getRandomValues()` fallback for older browsers.
- The key is created once per `handleGenerate()` call. Retrying that same
  attempt reuses the key; starting a new attempt creates a new one.
- The key is not derived from the local sequence, storage, subject or time, so
  two tabs, two reloads and two remounts cannot collide.

The HTTP body still sends the key as `requestId`. No server change is required
or made.

## Client lifecycle contract

`src/lib/campaign-lab/draft-lifecycle.ts` defines the shared
`CampaignDraftLifecycle` seam consumed by `OfferIntake` and `CampaignLab`.
`builder-runtime/lib/client-lifecycle.ts` implements it once as the
`builderClientLifecycle` singleton:

| Event | Persistence | Pending work | Storage | Other tabs |
| --- | --- | --- | --- | --- |
| Sign-out starts | Disabled before any clear | Aborted | All builder draft keys removed | Not yet |
| Sign-out confirmed | Disabled | Aborted | Removed again | `workspace-ended` broadcast |
| Sign-out unconfirmed | Re-enabled (session may still be valid) | Previous work already aborted | Already removed; operator sees retry | Not notified |
| Expiry detected | Disabled | Aborted | Removed | `workspace-ended` broadcast |
| Subject changed | Disabled | Aborted | Removed | `workspace-ended` broadcast |
| Remote tab ends | Disabled locally | Aborted | Removed without rebroadcast | Reloads |

`OfferIntake` checks `canPersist()` before restoring a persisted brief,
applying a prepared brief, or writing the draft effect. `CampaignLab` checks it
before generation and export and registers both abort controllers, so a
teardown cannot leave a delayed response applying to a new workspace.
Same-subject refresh recovery is unchanged: a normal reload still restores the
subject-scoped draft, because persistence is only disabled by an end event.

## Logout failure semantics

`POST /api/builder/session/logout` is considered authoritative only when it
returns a 2xx. Any non-2xx response or a network failure calls
`signOutUnconfirmed()`: the button becomes "Retry sign out", a
`[data-builder-logout-error]` alert explains that the server session may still
be active, and the page stays on `/builder`. The cleared draft is not restored,
and a later retry runs the full teardown again before navigating home.

## Related evidence

- [`docs/handoffs/BUILDER_BROWSER_BLOCKERS_20261120.md`](./handoffs/BUILDER_BROWSER_BLOCKERS_20261120.md)
  — exact commits, acceptance commands, 37-check result and remaining limits.
- [`docs/BUILDER_GENERATION_LIMITS_20261120.md`](./BUILDER_GENERATION_LIMITS_20261120.md)
  — unchanged server-side idempotency, quota and accounting contract.
