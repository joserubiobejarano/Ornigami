# Ornigami Coolify preparation — 16 October 2026

Owner: Jose; integration owns merge and rollout. Branch `codex/ornigami-coolify-preparation-20261016`, separate worktree `C:/Users/joser/Desktop/Projects/Ornigami-coolify-prep-20261016`. Original workspace and unrelated work are preserved. Nothing is merged, publicly routed, registered with providers or deployed through Coolify. Autodeploy, jobs, sending, paid AI and live-release gates stay closed.

The [deployment contract](../../../deploy/coolify/README.md) contains configuration, app-only resource/network/volume mappings, secret names without values, disabled task inventory, origin/callback requirements, backup/recovery and cutover/rollback procedures. Root Dockerfile and Compose files are the reviewable implementation. The earlier Caddy/systemd profile remains historical reference; do not install it beside Coolify.

## Source and dependency review

Initial clean local source: `b4c2c43172e0c9246d579ade2608c607eac34b6b`. Initial lock SHA-256: `08470cea636a89c15c731f04c033f3c7341a8c371337e45c12090d586d4aa563`. Locked Next 16.3.8, React/React DOM 19.2.0, Neon serverless 1.0.2 and sharp 0.35.5 were revalidated. Remote `main`, fetched directly on 16 October, was `e21249e971177a9c70c9a5534f4c8c6ff317cd79`, 45 commits behind the local baseline. Do not deploy GitHub main or infer it contains the reviewed local contracts. Integration must publish/review the candidate branch before any Git-based deployment.

The baseline lock-only npm audit reported zero findings across 767 dependencies. This did not establish safety: the [official Next October 14 update](https://nextjs.org/blog/nextjs-security-update-october-14-2026) identifies an App Router Server Action denial-of-service fix and other critical fixes in 16.4.1. This app has Server Actions. The prior sharp override covers the documented SVG workaround, not the remaining issues. Preparation updates Next and matching eslint config to 16.4.1, and React/DOM together to 19.2.9. Updated lock SHA-256 is `5eff2b421d8becc7d24b79b9af9265cb655014c56e36873c8400b2a2c1c5ed47`; Neon remains 1.0.2 and sharp 0.35.5. React's [RSC advisory](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components) concerns RSC server packages, including those vendored by frameworks; the React package version alone cannot establish RSC remediation.

Node is pinned to 22.23.3, Linux amd64 Debian bookworm-slim manifest `sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562`, directly checked with Docker Registry. [Node release history](https://nodejs.org/en/blog/release) and the [announced October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) must be rechecked at rollout. A Docker Hub scan of this base reported critical/high findings; this is a release blocker until final-image scanning identifies affected installed components and fixes or an explicit reviewed disposition. A patch/digest pin is not a vulnerability exemption. The glibc image preserves the existing sharp/Next Linux runtime expectations; no untested Alpine switch was made solely to lower scanner counts.

## Actual target observations

Read the unmerged QR host branch's `HANDOFF.md` and `docs/launch/hosting/SHARED_PROJECTS.md` directly. Authenticated private browser access confirmed Coolify 4.4.6, existing Ornigami UUID `vqkyv5dpjpjazuknkgyunioi`, fictional-staging UUID `d9ixeysd9tajcavvibltt3is`, zero resources. No owner password was needed, read, stored or regenerated. No resource duplicate was created.

Read-only SSH with the existing protected alias confirmed x86_64, Docker 29.9.1, only five control-plane containers, 11,960 MiB observed RAM, 1,114 MiB used, no swap and approximately 188 GiB free of 193 GiB. These are idle observations, not application capacity proof. The existing Traefik image is `traefik:v3.7`; inspected arguments use `http`/`https` entrypoints, `letsencrypt` resolver, Docker exposed-by-default false and no insecure forwarded-header override. No proxy/firewall/shared credential/settings changes were made.

The owner subsequently admitted one controlled build/validation window while QR Loyalty and Zoisial builds/deployments are paused, with aggregate approximately 2 GiB RAM and 1.5 CPU maximum. Building does not authorize deployment. The final receipt below must identify the actual candidate and measurements; failed or incomplete phases remain explicitly open.

## Verification and acceptance boundaries

Baseline focused security/CSP/VPS/schema checks passed 26 tests on the original installed dependencies with identical baseline lock. The new adapter/dispatcher checks passed 11 tests, including disabled gates, real lock exclusion, stale-lock failure, timeout/error cleanup and no retries. Those baseline receipts do not substitute for candidate dependency/build results.

Updated dependencies installed with `npm ci`; `npm run security:audit` reported zero findings, focused candidate suites passed 43 tests, and `npx tsc --noEmit` passed. A sanitized Windows `npm run build` passed in 36.5 seconds with only fictional OAuth/Auth values, a build-only origin and telemetry disabled; `npm run test:build` passed. The first attempt lacked a required fictional Google ID and failed at route collection; a sampled working set of 2.66 GB from that failed Windows attempt is not Linux build acceptance or a successful-build peak.

The tooling update changes ESTree project discovery from the local fast-glob adapter to tinyglobby. Its source/behavior tests were updated to the actual supported consumer while retaining functional project discovery and Next adapter coverage. New eslint-config-next React diagnostics identify existing frontend code: `react-hooks/set-state-in-effect` and `react-hooks/refs` are explicitly warnings during this tooling migration, with every other lint error rule preserved. This is visible lint debt, not a frontend refactor or a clean-warning claim. Final `npm test` rerun passed **641/641**, the corrected focused compatibility suite passed **11/11**, and `npm run lint` exited zero with **0 errors, 23 warnings** (11 effect-state, 11 refs and one existing Next navigation warning). Linux receipts follow in the completed evidence section.

Local Docker/WSL is absent; local Node is 24.11.1, so Windows checks are not target Node 22/Linux proof. Native resource, restart and filesystem results must come from the controlled host image rehearsal. A disconnected disposable container can prove startup, HTTP health, negative authorization, filesystem and cache behavior; it cannot prove public Traefik/TLS transport, session/OAuth/provider acceptance, database connectivity, Neon restore, natural cron receipts or external alert delivery.

## Remaining owner/integration dependencies

| Gate | Required evidence or input |
| --- | --- |
| Public origin | Accept exact canonical/alias hostnames, DNS A/AAAA and HTTPS/certificate ownership; align build/runtime origin and both Google callback paths before routing or registrations |
| Final image | Successful digest-bound Linux build, final-image advisory disposition, registry destination/access and immutable retained artifact; fictional-origin artifact must be rebuilt for accepted public origin |
| Neon | Explicit isolated fictional branch/database/role and effective connection ceiling; no production URL, data or migrations are authorized. Prove schema readiness and isolated restore before DB-backed rehearsal |
| App secrets | Private staging identities scoped only to app; provider credentials withheld. Preserve real durable encryption/signing keys only at separately accepted cutover |
| Ingress/session | Actual spoofed-header/unexpected-host/port checks and Secure session/callback proof through existing proxy; host-global trust/firewall needs go to hosting owner |
| Jobs | All three tasks and flags disabled; actual Coolify UTC and outer timeout semantics, single replica/stop-first behavior, old primary retirement and independent monitor acceptance before enabling any task |
| Recovery | Neon/config/media coverage, independently scheduled encrypted copies, external delivered alerts, key custody and replacement-host recovery proof; Coolify control-plane backup is insufficient |
| Release | Owner accepts measured idle/representative peak/native memory and CPU, no OOM/swap, compatible rollback image/schema and provider-specific acceptance. No public release or production migration granted here |

No shared roadmap is updated. Integration should inspect this branch and these receipts, resolve the gates, then separately handle publication/merge/deployment.
