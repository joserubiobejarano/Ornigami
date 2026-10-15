# VPS runtime and cutover reference

This is the reviewed Linux/systemd/Caddy reference for one application host and primary scheduler. Run its commands from the repository root. It does not provision a VPS, apply production SQL, deploy, retire Vercel or move Neon. Jose owns target rollout and rollback.

The later owner-confirmed hosting plan is Contabo US East with Coolify, intended for November 2026; target access is not yet available. These units are not a tested Coolify deployment. Review and adapt service ownership, ingress/header trust, filesystem writes, secrets, scheduling and rollback to the actual control plane before installation. Keep one application supervisor/ingress and one automatic primary scheduler. See [VPS privacy/backup verification](../../docs/PRIVACY.md#planned-contabocoolify-verification) for the pending actual-target evidence.

## Prepared runtime

The templates in `deploy/vps` use `/usr/bin/node` (Node 22), the unprivileged `ornigami` user/group, releases under `/opt/ornigami/releases/<commit>`, and `/opt/ornigami/current` as the selected release link. The application runs `next start` on `127.0.0.1:3000`. Caddy terminates TLS for `ornigami.com`, redirects `www`, replaces forwarding headers and removes alternate client IP headers used by the application. This assumes a direct internet-facing Caddy host; adding a CDN or another proxy requires a separate trusted-proxy review.

Before installation, record the exact provider/host/region, Linux image, Node 22 patch version, Caddy/systemd versions, IPv4/IPv6 addresses, database project/branch, release commit and previous compatible release. These are operator inputs still pending. Permit inbound 80/443 and restricted operator SSH; do not publish port 3000. Point both hostnames' A/AAAA records to the intended host, including removing stale AAAA records. Caddy needs persistent certificate storage, outbound certificate authority access and working renewal. Set host time synchronization; timers specify UTC independently of host timezone.

Create the system account without login or sudo. Keep release source and dependencies root/deployer-owned and readable by the service; grant only the runtime cache paths in the app unit to `ornigami`. Create those paths before starting the service. Keep earlier compatible release artifacts for rollback. The hardening directives require validation on the chosen distribution. The current app has no explicit ISR/revalidation configuration; adding it requires reviewing Next.js writes under `.next/server` against this filesystem sandbox.

Install `deploy/vps/runtime.env.example` as `/etc/ornigami/runtime.env` with root ownership and mode `0600`, in a root-owned directory that other users cannot modify. Populate values privately; leave unused integrations unset rather than blank. systemd loads the file before dropping service privileges. It is not a shell script: do not source it or echo its contents. Preserve existing encryption and link-signing keys across hosts so tokens, unsubscribe links and evidence remain valid. A move alone is not a key rotation. Keep Sentry upload credentials in the controlled build environment, outside runtime. Leave reconciliation, account deletion and both guarded retention flags disabled until their separate gates close.

Build the exact reviewed commit on Linux/Node 22 with `npm ci` and `npm run build`, followed by the existing build smoke check and applicable Quality/Security checks. Supply `NEXT_PUBLIC_APP_URL=https://ornigami.com` and the intended public Sentry DSN at build time; Next.js embeds public variables, so changing only runtime configuration cannot correct an artifact built for another origin. Record the build ID and artifact digest privately. Do not copy a Windows `node_modules` or CI dummy-origin build to the host. See the installed Next.js self-hosting guide for cache and build/runtime behavior.

Install the app unit in `/etc/systemd/system` and the Caddy template as `/etc/caddy/Caddyfile`. After installation and before starting traffic, run as the operator:

```sh
sudo /usr/bin/node /opt/ornigami/current/scripts/vps-preflight.mjs
sudo systemctl daemon-reload
```

Preflight checks structural runtime prerequisites and configuration validation; it is not provider, environment-content, TLS-renewal or public-transport acceptance. Starting/enabling services is part of the separately authorized rollout. Inspect service failure/restart behavior, cache permissions, disk/memory headroom and graceful shutdown on the real host.

## Schema 039–042

Neon remains the database. `neon/migrations` is the sole migration history; previously applied files are unchanged. Verify the release manifest before migration:

```sh
node scripts/vps-schema-release-check.mjs
```

This local check verifies ordered canonical SQL hashes, not applied database state. Pin the target database branch and baseline schema through 038, including earlier nonconsecutive migration numbers. Store a private application ledger of each applied file, normalized hash, transaction outcome, timestamp and operator. Never blindly replay 040: it renames existing functions and is not an idempotent migration runner.

1. Pause enrollment, manual/CSV/booking Booster intake, all primary/recovery dispatches and retention mutation. A scheduler pause alone does not stop HTTP intake. At ingress use an operator-reviewed maintenance response while preserving signed provider callback handling, or stop public application traffic in a planned maintenance window. Drain or resolve live job, billing, delivery, reply and deletion/provider leases. Preserve uncertain operations and their fences; do not clear them to make rollout proceed.
2. Capture a private pre-release backup/PITR restore point and prove a restore on an isolated database branch. Record branch IDs, restore point, permissions, expiry and restore duration. Avoid placing backup credentials or customer dumps in the worktree. The application-backup retention target in operations is not proof of vendor configuration.
3. Apply 039, then 040, then 041, then 042 once, each with stop-on-error and an explicit transaction on the pinned target. Use an operator-configured private connection/service file, never a connection string pasted into shell history. For example, `psql -X --set ON_ERROR_STOP=1 --single-transaction --file neon/migrations/039_billing_lease_duplicate_alias.sql`, then the other three files. Set bounded lock/statement timeouts for the maintenance window. A transaction failure stops subsequent migrations; investigate and repair forward or use the verified restore procedure.
4. Run `psql -X --set ON_ERROR_STOP=1 --file deploy/vps/schema-readiness.sql` through the same private target connection. Every returned `ready` value must be true; SQL execution success alone is insufficient. The query inspects catalog definitions/signatures and emits only named booleans. Verify permission admission, the 025/036 lifecycle/suppression wrapper chain, terminal trigger bindings and 041 late-callback behavior on the target. Capture results privately; local manifest success alone cannot certify this. Validate schema behavior on a disposable restored branch before production.
5. Select the matching application artifact, verify health and permitted intake, and resume intake only after permission behavior and signed callbacks pass. Historical bookings do not acquire consent by migration. Keep guarded retention disabled; a successful migration does not authorize minimization.

039 repairs duplicate billing-event lease acknowledgement. 040 changes admission contracts and makes legacy visits without purpose-specific evidence send-ineligible. 041 adds terminal clocks, protective holds and hash-only correlation tombstones; actual cleanup remains separately gated and cannot be undone by changing flags. 042 adds explicit expected cadence jobs; intentionally disabled paid AI excludes only Replies never-run/missed-cadence alerts, while all known failed/partial/stale-running operations remain visible. Match 042 with its application consumer before verifying health.

## One primary scheduler

Install the `ornigami-cron@.service` template and the three timer files in `/etc/systemd/system`. They share a local lock and call only loopback cron endpoints with a bearer secret from the private runtime environment. Requests have bounded timeouts, reject redirects and fail on HTTP errors, including a busy lease (409). HTTP 202 is an accepted bounded continuation; inspect persisted state for completion. No automatic HTTP retry is added around ambiguous provider outcomes.

| Timer | UTC cadence |
| --- | --- |
| `ornigami-cron-review-booster.timer` | Minute 7 every hour |
| `ornigami-cron-review-replies.timer` | Minute 11 every four hours, only when Replies/paid AI is explicitly enabled and its Google/provider gates close |
| `ornigami-cron-privacy.timer` | 03:00 daily |

Timers intentionally do not catch up missed executions after downtime. Review missed schedules rather than replaying provider work automatically. Keep timers disabled throughout preparation and schema maintenance. At the free/AI-disabled launch, enable only Booster and privacy after acceptance; keep the Replies timer disabled because its endpoint rejects generation before a lease. Before enabling any selected primary timer, disable superseded historical schedules and verify no queued/running work remains. `vercel.json` is historical configuration; deploying it to Vercel would still configure its schedules. GitHub Booster/Replies workflows remain manual recovery only. Retain the independent hourly GitHub health monitor and align its private origin/secret with the VPS after cutover. Intentional disabled cadence must never suppress actual failed/partial/stale-running alerts or erase unresolved provider evidence.

For an authorized cutover, validate installed units with `systemd-analyze verify`, inspect next occurrences with `systemd-analyze calendar`, then enable only the three reviewed timers. `systemctl list-timers --all` and `journalctl -u 'ornigami-cron@*'` supplement persisted cron health. Every manual recovery action must first coordinate with the primary scheduler and leases. A manual successful request is not a natural timer receipt.

## Target acceptance and rollback

Before opening enrollment, record successful public HTTPS/certificate and redirect checks, rejection of unexpected hosts, inability to reach port 3000 externally, spoofed-IP/header behavior, authenticated session cookies and both Google callback origins. Verify Stripe and Resend signed callbacks on the exact deployment without creating duplicate endpoints or authorizing real charges/messages/replies. Verify private database access, health summaries and alert transport. Capture natural VPS receipts for each enabled cadence (Booster and privacy at the AI-disabled launch), paired with persisted outcomes, exact commit and service/timer identity. Confirm the independent health monitor reaches this origin. A 200 landing page alone proves neither database health nor scheduler/provider readiness.

For rollback, stop the three timers, pause affected intake and drain live work. Close either retention flag to stop future guarded minimization; this does not recover disposed content. Preserve durable usage, idempotency, unknown fences, suppression, permission, lifecycle and tombstone evidence. Never reverse 039–042 by dropping tables/functions or relaxing permission gates.

An application rollback is allowed only to a release already verified against the 040 admission contracts, 041 retention schema and 042 alert interface. A pre-040 application may call obsolete signatures and fail closed; if no compatible previous release exists, keep intake/jobs paused and forward-fix. With services stopped, atomically select the retained compatible release link, restore its reviewed configuration without changing durable keys, rerun preflight, start and verify the application, then enable exactly one scheduler after confirming no overlap. Keep Caddy on the same public origin. Record both commits and reason.

A database restore is an exceptional separately authorized recovery, not the routine application rollback. Restore first into isolation, reconcile all provider operations since the restore point, and reapply erasure/suppression/permission evidence before reopening traffic. Do not replay deliveries, charges or callbacks blindly. Restoring pre-040 data does not permit permissionless intake.
