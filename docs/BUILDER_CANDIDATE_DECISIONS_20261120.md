# Builder candidate decisions — 20 November 2026

Status: **local source candidate only; NO-GO for staging or customer access at
this SHA until the Linux/image and owner gates below pass.** Access stays
closed, the live provider stays disabled, and no real invitation, deployment,
DNS/edge change or paid call is authorized by this file.

> **Update 22 November 2026:** the retained image/archive in this record's
> successor was accepted for the synthetic loopback private HTTPS edge in run
> `45043028345` (source `156259d`, image `sha256:d50ef...`, consumer harness
> `b1c6cce`). That is **not** customer admission or deployment authority. The
> privacy, support, retention, custom-Next and hosting decisions in this file
> remain proposals/owner decisions and are still pending. See
> [the accepted result](./BUILDER_RETAINED_IMAGE_QUALIFICATION_20261122_R2.md)
> and [owner decisions](./OWNER_DECISIONS_BETA_20261122.md).

## Exact source

- Candidate branch: `codex/ornigami-builder-final-integration-20261120`
- Candidate application SHA before this record: `ddd3090d09abef5c8834742ea51511205cbc3ce0`
- Application tree: `507ce16a8cda7800640c04efa558d01f365ab797`
- Packaging: `9faf576` / `7def198` (`deploy/builder/`)
- Server hardening: `0ca0c1f` / `af0160d`
- Browser blocker fixes: `9022c97` / `3193358`
- Base accepted integration: `5129190`; review target `7b86743`

The merge is not a byte-for-byte fast-forward. Two independent fix branches
changed the same client files. The resolution keeps the browser lifecycle
(persistence-off before clear, abort of pending work, cross-tab clearing,
retryable sign-out) and the hardening server contracts (logout confirmation,
reservation-time admission, canonical UUID request id, lock and redemption
bounds). One compatibility correction was required: the reviewed attempt key
used a `gen_` prefix that the hardened route rejects. The key is now a
canonical UUID per attempt; local sequence ordering is unchanged. This is a
7-line diff with its test updated.

## Local evidence

Windows 11 x64, Node `v24.11.1`, synthetic identities, deterministic provider.

| Check | Result |
| --- | --- |
| Focused builder suites | 60/60 pass |
| Browser blocker/refresh/edit/two-tab/storage/sign-out/expiry journey | 37/37 checks, 7 distinct canonical UUID attempt keys |
| Authenticated quota, restart, backup/restore, closed rollback journey | 39/39 checks |
| Generation-limit route matrix | 12/12 pass; restart and unknown reconciliation included |
| Server hardening route matrix | 9/9 pass; revocation before/after dispatch included |
| Full suite (Windows) | 1,381 tests, 1,375 pass, 6 fail |
| Base `7b86743` reproduction of the same 6 suites | 6 fail, same names |
| TypeScript / ESLint changed files | pass / 0 errors |
| Builder build and smoke | pass, 0 denied egress each |
| Legacy offline build and production smoke | pass; legacy Sentry attempts remain a shared-app characteristic |
| SRI | 9/9 scripts carry matching SHA-256 integrity; rotating nonce; no script `unsafe-inline`/`unsafe-eval` |
| ZIP audits | 2 ZIPs, 14 entries each, CRC clean, no duplicates/traversal, no remote script/CSS, packshot hash and receipt revision agree |
| Dependency advisories | full 0, production 0, info/low/moderate/high/critical all 0 |

The six full-suite failures are the three instrumentation module-resolution
failures and three staging synthetic-fixture SQL assertions. They reproduce at
the review target and are unrelated to the builder. The four Windows `bash.exe`
`/tmp` failures reported by the independent review passed in this run; they are
environment/timing-sensitive and must not be treated as Linux evidence.

## Actual-host checks still open

No Docker, Podman, nerdctl, WSL distro or Bash was present. Therefore this
candidate has **no** Linux execution and **no image digest**. The following are
unverified and block staging:

- Linux/Node 22 clean install, full suite, builder build and dependency audit.
- Image build from this exact SHA; pinned parent digests, revision label, UID/GID
  1000, health check and non-root runtime.
- Read-only root, writable-path set, store `0600`, single writer/volume/replica.
- Container restart, volume replacement, stopped backup, restore into a fresh
  container and closed rollback on the actual host.
- Default-deny egress and zero provider/DB/mail/Sentry traffic at runtime.
- Reverse proxy/TLS/origin behavior and private edge access.
- Host clock, crash consistency, resource limits and backup encryption.

No image was built or pushed. No digest can be reported until an authorized
Linux runner executes `deploy/builder/qualify-linux.sh`.

## Decision record

### Privacy

Builder draft text is browser `sessionStorage`, scoped to subject, and is
cleared on confirmed sign-out, unconfirmed sign-out teardown, expiry, account
switch and remote tab end. The durable server store holds identity/session
hashes and usage metadata, not brief text. There is no customer-facing builder
retention/deletion notice specific to draft text and no encryption-at-rest
plan. **Decision: do not admit real customer data until the owner approves the
notice, deletion workflow and at-rest protection.**

### Support

Invite issuance, resend, recovery, limit increases and spend denials are manual
operator actions. No email delivery, self-serve provisioning, password/MFA or
customer usage dashboard exists. **Decision: beta support remains manual and
operator-hours-bound; the owner must accept the response time and escalation
before real invitations.**

### Retention

`identity-store.json` has no scheduled cleanup for identities, sessions,
invites or usage records. Local backup retention and access are undefined.
**Decision: no automatic deletion in this candidate; the owner must set a
retention period, backup retention and deletion evidence before real data.**

### Custom Next ownership

Installed `next@16.4.5` resolves to
`vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`, SHA-256
`65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28`.
Its identity record says `adopted: false` and `maintenanceOwners: unassigned`.
**Decision: retain it only for the invite-only rehearsal, not as
release-adopted. A named owner and a rebase/re-test procedure for every
upstream security release are prerequisites. Otherwise replace it with official
Next.js and re-qualify CSP/SRI.**

### Other fixed decisions

- One replica, one local store, one writer. No shared filesystem or horizontal
  scaling.
- Same-image `closed` mode is the quota-preserving rollback: it serves `/` 200
  and keeps `/builder` 404, session 401 and all usage records. Parent `ec801ba`
  is emergency-stop only and loses quota enforcement.
- Default access is closed; invite mode is explicit; test provider hooks are
  off; live provider and paid calls remain unauthorized.

## Staging plan for owner review (not authorized)

1. Freeze this SHA. Build the image on the authorized Linux runner with the
   exact `NEXT_PUBLIC_APP_URL` and `ORNIGAMI_SOURCE_SHA`; record the image digest
   and labels.
2. Run `deploy/builder/qualify-linux.sh` with a clean worktree. Require UID/GID
   1000, read-only root, documented writable paths, store `0600`, health 200,
   `/builder` 404, session 401, zero egress and a passing restart/backup/restore/
   closed-rollback sequence.
3. Run the full suite on Linux/Node 22 and reconcile the six known failures.
   Re-run full and production dependency audits against the image lock.
4. Re-run this candidate's browser journeys and the quota/rollback journey
   against the actual built image, not the Windows dev server.
5. Deploy to a private staging origin with edge BasicAuth, one replica, one
   dedicated volume, no provider/DB/mail/billing/Sentry configuration, and
   synthetic invitations only.
6. Obtain owner sign-off on privacy, support, retention and custom-Next
   ownership. Only then request authorization for real invitations or a paid
   provider canary.

Deployment, DNS, real invitations and paid calls require separate
authorization. If any Linux gate fails, keep the app stopped or in `closed`
mode and preserve the store and usage records.
