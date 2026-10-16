# Coolify preparation — 16 October 2026

The [external build approval packet](../../docs/handoffs/ornigami-coolify-20261016/RUN_APPROVAL.md) describes the preparation-branch-only Linux image workflow. Installing it in Git does not grant deployment, scheduler, provider or GHCR publication permission.

This profile replaces the installation steps in the [VPS reference](../vps/README.md) for the existing shared Contabo host. Its runtime, permission, retention, lease, schema and recovery contracts remain binding. This is preparation, not permission to deploy, enable autodeploy, register providers or open public traffic. See the [task handoff](../../docs/handoffs/ornigami-coolify-20261016/HANDOFF.md) for dated evidence and unresolved gates.

Use existing Ornigami project `vqkyv5dpjpjazuknkgyunioi`, fictional-staging environment `d9ixeysd9tajcavvibltt3is`. Do not create duplicate projects/environments. Authenticated browser inspection confirmed zero resources. Dashboard access is the owner's private localhost SSH tunnel; it is not an application origin. Coolify 4.4.6, its Docker supervisor and its existing Traefik v3.7 own ingress and process supervision. Install neither Caddy nor the old app/systemd units. No shared settings are changed by these files.

## Artifact and resource mapping

| Item | Prepared mapping |
| --- | --- |
| Source/build | Root `Dockerfile`, exact committed source and lockfile; Linux amd64; `npm ci`, full `npm run build` including static CSP hashes |
| Runtime | Root `compose.coolify.yaml`; one `app`, UID/GID 1000, read-only root, dropped capabilities, no-new-privileges, init and SIGTERM grace 45 seconds |
| Budget | 768 MiB hard memory, 0.75 CPU, 128 PIDs; Node old-space 512 MiB. Native allocations, buffers, image optimization, tmpfs and child processes count toward the container limit |
| Ingress | No host port mapping; internal Node 3000 only. Base profile disables Traefik and uses an app-specific Compose network |
| Public routing | Separate `compose.coolify.traefik.yaml`, held closed pending exact origin acceptance; attaches only this app to existing `coolify` network |
| Cache | App-specific `next-cache` named volume at `/app/.next/cache`; verify actual Coolify-generated volume identity and UID before admission |
| Temporary files | Bounded 32 MiB `/tmp` tmpfs; shared cron lock, cleared on container recreation; never durable customer storage |
| Database | External Neon HTTPS client; no local PostgreSQL, SQL host port, database volume or copied QR database |
| Media | No durable upload/media store found in this profile. CSV processing is not a persistent upload archive. Adding durable media requires its own app-specific volume/object store, permissions and recovery proof |
| Logs | Container json-file rotation, three files of 10 MiB; safe application summaries only, no bearer values, cookies, connection URLs or provider payloads |

The shared proxy network is an operational boundary, not tenant-grade isolation from root/Coolify or other attached services. Do not mount the Docker socket in the app. Keep one replica and stop the previous instance before replacement; no rolling overlap or independent scheduler container is prepared. Cross-process database leases remain authoritative even when a local lock is held.

Use a content-addressed image reference in `ORNIGAMI_IMAGE`; a mutable tag is not release identity. Supply the full committed `ORNIGAMI_SOURCE_SHA` as build argument, an accepted `ORNIGAMI_PUBLIC_ORIGIN` at runtime and the same origin as build argument `NEXT_PUBLIC_APP_URL`. Public variables are embedded at build time. The no-domain rehearsal uses only `https://rehearsal.invalid`, never provider registration or public DNS. Rebuild for the accepted public origin; do not promote the fictional-origin image to production. No registry destination or publishing credential is assumed.

Only one build may run. The owner admitted one controlled window on 16 October while QR and Zoisial builds/deployments are paused. Recheck active build containers, resource use and queue before starting; respect queue eight and concurrency one. Use a temporary app-specific BuildKit builder with an aggregate 2 GiB hard memory limit, no additional swap and 1.5 CPU ceiling, serial worker parallelism. Docker builds use one Next worker and a 1408 MiB build heap; this differs from the 512 MiB runtime heap. This is temporary build capacity, not an always-on service. If it cannot finish, stop and report; do not raise shared quotas. Record exact commit, lock hash, base digest, public build inputs, image ID/digest, wall time, cgroup memory peak and OOM counters. Remove only this task's temporary builder after collecting evidence; never prune shared Docker state.

The executable rehearsal is `scripts/coolify-image-rehearsal.sh`. It requires a selective `git archive` from the committed candidate, its SHA-256 and embedded commit verification, and an exact allowlist of the five running control-plane container names. Transfer only tracked build inputs (Dockerfile, dockerignore, Compose, package manifests, source, public assets, scripts and required root configs), not the full private checkout. The script checks extracted bytes against that archive, refuses private paths and other running containers, creates no Coolify resource, runs its disposable app with `--network none`, and retains only the local candidate image and evidence. Its cleanup never prunes unrelated Docker resources. Review and run only in an admitted window.

## Origin, proxy and session acceptance

There is no accepted domain. The older `ornigami.com` references are historical, not an instruction to register or route that name. The integration owner must accept the exact canonical hostname, optional redirect aliases, DNS A/AAAA target, TLS ownership and build/runtime origins together. Remove stale AAAA records when IPv6 is not admitted. Tunnel localhost is never a public callback origin.

The routing overlay uses the installed `https` entrypoint and `letsencrypt` resolver, exact Host matching, internal port 3000, and app-specific request-header middleware. It removes `X-Real-IP`, `X-Vercel-Forwarded-For`, `CF-Connecting-IP` and `Forwarded`, fixes forwarded host/protocol to the approved origin and leaves Traefik responsible for trusted client X-Forwarded-For. Preserve app CSP/nonces, static CSP hashes, HSTS, frame/permissions/content-type policies and Auth.js session/callback behavior; do not replace response policies at the proxy. The app trusts host input and prioritizes alternate IP headers, making these negative checks required. Installed Traefik arguments were inspected without modifying them; no insecure forwarded-header trust override was observed. This is not spoofing acceptance.

Before routing, test unexpected Host rejection, injected forwarded host/protocol and alternate IP headers from outside the proxy; verify the effective client identity and canonical redirects without logging personal IPs or cookies. Verify Node 3000 is unreachable externally, session cookies are Secure/HttpOnly with the expected SameSite policy, unsafe callbacks are rejected, and CSP allows the actual generated hydration scripts. Add an exact HTTP-to-HTTPS redirect/optional alias router only after those names are accepted; the supplied overlay creates no alias or HTTP router. Any need to change shared entrypoints, trusted proxy ranges, firewall or certificates must go to the hosting owner.

Required exact registration paths once an origin is accepted:

| Purpose | Exact path appended to accepted HTTPS origin |
| --- | --- |
| Google sign-in | `/api/auth/callback/google` |
| Google GBP connection | `/api/google/oauth/callback` |
| Stripe signed events | `/api/stripe/webhook` — confirm against source and existing endpoint before registration |
| Resend signed events | `/api/webhooks/resend` |
| Customer booking intake | `/api/webhooks/booking`; per-business signed credentials stored in the database, separately admitted intake, not a shared provider secret |

Keep `AUTH_URL` aligned with `NEXT_PUBLIC_APP_URL`, remove unused blank aliases, and preserve signing/encryption keys across a move. Do not create duplicate provider endpoints or perform provider registration/testing in this task.

## App-scoped configuration and secrets

Use application runtime variables only, never global/team/shared variables. Coolify/root admins can access them. The [runtime reference](../vps/runtime.env.example) is an inventory, not a file to upload with its historical domain defaults. Do not commit populated env files or include them in Docker build context, build args, logs, image history or browser screenshots.

| Scope | Names and handling, without values |
| --- | --- |
| Core runtime secrets | `DATABASE_URL`, `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `REVIEW_BOOSTER_UNSUBSCRIBE_SECRET`, `CRON_SECRET`; separate staging identity, preserve existing durable keys at real cutover |
| Public origin/config | `NEXT_PUBLIC_APP_URL` at build and runtime, `AUTH_URL` runtime; `NEXTAUTH_URL`/`NEXTAUTH_SECRET` only deliberate compatibility aliases, never blank |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` are structurally required by auth module initialization even when OAuth is unused. The disconnected rehearsal supplies fixed fictional placeholders, never real provider credentials; real pairing requires separate acceptance |
| Billing, omitted | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, six current `STRIPE_PRICE_*` catalog IDs; no production billing credentials |
| Mail, omitted | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `REPLY_TO_EMAIL` |
| AI, omitted | `OPENAI_API_KEY`; `OPENAI_ENABLED=false` stays enforced |
| Telemetry | Optional public `NEXT_PUBLIC_SENTRY_DSN`, build/runtime pairing required; omit during rehearsal to prevent external delivery |
| Build-only, omitted | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`; controlled secret mount if later approved, never baked into an image or runtime |
| Operator only | `SUPPORT_DATABASE_URL`, export/restore credentials and recovery keys; never app runtime |

Keep reconciliation, account deletion, both guarded retention flags, all `ORNIGAMI_COOLIFY_*` cron/Replies acceptance gates false. Leaving sends disabled also requires withholding provider credentials and public intake; AI=false alone does not prevent static Booster mail. Do not connect a production database for a health test.

Neon uses `neon()` over HTTPS, not a Node `pg.Pool`; inventing `PGPOOL_MAX` would not bound this client. Existing SQL wrappers bound ordinary statements to 10 seconds and requests to 11 seconds, shortened by cron deadlines. Before a DB-backed staging rehearsal, obtain a dedicated disposable Neon branch/database and least-privilege role, prove its target identity, configure/verify an effective server-side connection ceiling (proposed five), statement/lock timeouts and endpoint concurrency/admission. If the Neon tier cannot enforce that ceiling, agree and measure a supported alternative before admission. Do not use the production role, migrate production, or claim a configured pool. No DB URL or Neon branch has been supplied for this preparation; DB-backed health, migrations and restore remain closed.

## Disabled jobs and monitoring

`scheduled-tasks.json` is a review inventory, not a Coolify import/API schema. Manually map it to the app container only after review; verify Coolify's actual UTC interpretation and execution timeout support before enabling. All three entries remain disabled:

| Job | UTC | Container command |
| --- | --- | --- |
| Booster | `7 * * * *` | `node scripts/coolify-cron-dispatch.mjs review-booster` |
| Replies | `11 */4 * * *` | `node scripts/coolify-cron-dispatch.mjs review-replies` |
| Privacy | `0 3 * * *` | `node scripts/coolify-cron-dispatch.mjs privacy` |

The adapter requires global and per-job gates, plus separate Replies acceptance. It holds one atomic nonblocking `/tmp/ornigami-cron-dispatch.lock` and calls the existing dispatcher inside the web container. Requests remain loopback-only, bearer-authenticated, redirect-rejecting, 55-second bounded and unretried. Existing endpoint cooperative budget is 45 seconds. Coolify's proposed outer execution ceiling is 70 seconds; verify supported enforcement, do not assume inventory metadata enforces it. Only 200/202 are accepted; 202 is continuation, not durable completion, and 409 is a failed/busy dispatch without automatic retry.

No missed-run replay/catch-up is permitted. SIGKILL or failed lock removal leaves a fail-closed lock. Before removing it, pause tasks, prove no dispatch/provider lease is active and inspect persisted state; never reclaim merely because a timestamp is old. Container recreation clears tmpfs but does not clear database leases or provider uncertainty. Correlate scheduler receipts with persisted outcomes and independent `/api/cron/health` summaries. Health bearer checks must reject missing/incorrect tokens; an ordinary container HTTP health probe proves neither database nor scheduler health.

Keep historical Vercel primaries off before any VPS primary is enabled; GitHub Booster/Replies remain manual recovery only. Keep the independent hourly health monitor at minute 15 and prove external alert delivery after origin/secret acceptance. Intentional Replies disablement must not hide failed, partial or stale-running evidence. Do not enable or naturally dispatch jobs in this preparation.

## Backup, recovery and cutover

Host backup receipts cover the Coolify control plane only. Maintain separate inventories for Neon/PITR and encrypted independent exports; application configuration/keys; persistent app media if introduced; and regenerable cache. Assign owner, destination, encryption and key custodian, schedule UTC, retention/expiry, failed-copy handling and restore checks to each. The 35-day application backup target is not a verified configured retention. Do not purchase storage or silently create schedules. Scheduled independent copies, delivered external alerts, separate key custody and replacement-host proof remain open with the hosting owner.

For an admitted fictional rehearsal, export only the isolated branch through a private credential file, checksum/encrypt the export, restore to a second isolated branch with no provider credentials and measure restore duration. Verify schema readiness, permissions, counts/invariants and post-snapshot lifecycle/erasure/suppression/holds/unknown-provider fences before opening any intake. Never paste a DB URL into a command/history. Export app-only configuration securely, keeping keys outside both Git and the host; test decryption with the custodian. Cache may be rebuilt, not treated as the only copy of customer media. Test restart with unchanged app volume and recreation with cache ownership checked, then remove only disposable test resources. Do not touch another project's volumes/networks.

Real cutover is separately authorized: accept exact origin/TLS/provider pairing, final image scan and measurements; pin Neon target and compatible schema; pause intake and old schedulers; drain or preserve live/unknown leases; capture verified pre-change restore point; apply canonical 039–042 only with target authorization and readiness evidence; start the digest-pinned app; verify negative checks and public transport; then enable at most the admitted Booster/privacy primary after old-primary retirement. Replies remains closed. No production SQL, provider sends or migration is authorized here.

Rollback first closes intake/tasks and preserves durable usage, idempotency, suppression, lifecycle and unknown-operation evidence. Select the retained image digest/config already verified compatible with 040/041/042; use the same origin and durable keys, verify startup/health, then resume only one separately admitted scheduler. If no compatible previous image exists, remain paused and forward-fix. Do not drop schema or clear fences. A database restore is separate exceptional recovery into isolation with post-snapshot provider and rights reconciliation, never routine app rollback. Record both image/source identities, reason, operator and receipt.
