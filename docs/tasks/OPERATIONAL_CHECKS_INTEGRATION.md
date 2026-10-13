# Operational checks and integration — October 13, 2026

Worktree: `Ornigami-Operations`; branch: `task/operational-checks-integration`. Reviewed baseline and remote main: `e21249e971177a9c70c9a5534f4c8c6ff317cd79`. This handoff records task-specific evidence; the October 4 release ledger remains a historical snapshot.

## Fresh natural GitHub health

[Run 38334925022](https://github.com/joserubiobejarano/Ornigami/actions/runs/38334925022) has `event=schedule`, `conclusion=success` and the baseline SHA above. GitHub reports `createdAt=2026-10-13T02:01:34Z` and `updatedAt=2026-10-13T02:01:45Z` after completion (04:01:45 Europe/Madrid); the health job started at 02:01:37 UTC. Both the Luna verifier and the reviewer retrieved the run metadata and authenticated endpoint step log independently. The allowlisted response at 02:01:43 UTC was:

```json
{"healthy":true,"alerts":[],"jobs":[{"job":"privacy_retention","status":"succeeded"},{"job":"review_booster","status":"no_work"},{"job":"review_replies","status":"no_work"}]}
```

The workflow is active; its remote source matches `.github/workflows/cron-health.yml` with `15 * * * *`. The observed creation minute differs from that configured minute; the originating scheduled slot and delay are not established by the run metadata. The natural-trigger proof is GitHub's `event=schedule` field. `cron-health-summary.mjs` rejects malformed/unhealthy responses and exits unsuccessfully when alerts exist. No manual dispatch or health endpoint call was made to manufacture this receipt. This closes the fresh natural-success observation at this time; irregular historical gaps do not establish reliable hourly delivery or sustained availability. The workflow SHA identifies the monitor source, not the application's deployed SHA.

Baseline [Quality 37238431208](https://github.com/joserubiobejarano/Ornigami/actions/runs/37238431208) and [Security 37238431267](https://github.com/joserubiobejarano/Ornigami/actions/runs/37238431267) passed on the baseline SHA on October 4. These are baseline results, not CI for this handoff or future integrated changes.

## Temporary A12 child removal — confirmed

Historical identity: project `bitter-brook-23785103` (`Local Lift`), child `br-noisy-shape-aly2lr5p` (`a12-support-access-20261004`), production parent `br-red-frost-alc3smfv`. The saved deadline was October 5, 2026 at 16:00 UTC / 18:00 Madrid. Historical disposition is recoverable with `git show 84334c7:docs/tasks/A12_TEST_BRANCH_DISPOSITION.md`.

At October 13 02:03:50 UTC, the A12 credential was absent from its established private directory. Following operator sign-in, the reviewer inspected only Local Lift (`bitter-brook-23785103`), as explicitly directed by the owner. Its authenticated production overview identified parent `br-red-frost-alc3smfv` and a project branch count of one. The loaded, unfiltered [branch inventory](https://console.neon.tech/app/projects/bitter-brook-23785103/branches) displayed `1 Branch` with only `production`, with no pagination or search filter hiding another branch.

The exact [child detail](https://console.neon.tech/app/projects/bitter-brook-23785103/branches/br-noisy-shape-aly2lr5p) then returned `Request failed: branch not found` at approximately 02:06–02:07 UTC (04:06–04:07 Madrid). Together with the accessible exact project/parent and complete inventory, this confirms actual provider removal of the child. This is authenticated UI evidence, not an HTTP-status/API or exact deletion-time claim. This task performed no child, parent, role or provider configuration mutation; no other project was inspected. Credential removal and provider absence are separately evidenced.

## Migration and integration coordination

All three peer task branches started at the baseline SHA. Their working changes are under active development and are not integrated or approved by this snapshot.

| Task | Observed scope | Integration requirement |
| --- | --- | --- |
| Permission/retention | Proposed `040_permission_evidence.sql`, `041_guarded_retention.sql`; intake, sending, retention, notices and rights register | Allocate 040 and 041 to this task. Recheck the final migration map, permission admission and retained ledger/suppression/trial fences before integration. |
| Billing acceptance | Checkout, billing/pricing UI, reconciliation/Postgres tests, isolated Stripe acceptance script | Preserve the approved 14-day no-card trial; review provider target guards and quota/history/replay evidence. |
| Performance | Package scripts, measurement runner/core and focused tests | Measure the final integrated build; preparation results alone do not close load acceptance. |

Keep 029–030 reserved and 039 unallocated. Gaps need not be filled; do not renumber reviewed/applied migrations. Before integration, compare final committed changes against main again and check filename/number collisions. This allocation is recorded here without changing the shared roadmap or peer working files.

The baseline uses one migration tree, `neon/migrations`, through 038. Preserve the 025/036 send-wrapper chain: numeric fresh installation and replaying 025 on an existing 036 schema must retain the outer lifecycle fence. Schema must precede consumers in the integration session's reviewed rollout; keep deletion disabled and preserve uncertain provider fences. No migration was applied to a shared or production database by this task.

## Verification and handoff

The reviewer ran `node --experimental-strip-types --test tests/a00-cron-health-summary.test.mts tests/a11-lifecycle-ops-postgres.test.mts` from this worktree: **2 passed, 0 failed, 0 skipped**. The PostgreSQL test created an isolated local cluster, applied the baseline numbered migration chain and exercised lifecycle leases/drains; it did not connect to Neon. `git diff --check` passed.

Luna additionally observed passing migration/lifecycle replay with the proposed 040/041 chain in the permission worktree, the focused A07 booking PostgreSQL fixture and privacy-rights register checks. The booking pass used its earlier explicit 023 fixture; subsequent peer edits changed it to replay the full chain, and that new fixture is not covered by this earlier result. These are moving working-tree observations, not acceptance of the final permission commit.

The peer review rerun `node --experimental-strip-types --test tests/a07-csv-intake.test.mts tests/a17-integrated-delivery.test.mts` in Permission-Retention produced **7 passed, 3 failed, 0 skipped**. Two CSV assertions still expect the old behavior: two rows without permission evidence now both skip (line 96 expects one); after rejecting phone-only intake, the downstream persisted visit count must change from five to four (line 348). The A17 member-intake path returned 400 instead of 201 even after permission fields were added, so its harness/payload needs diagnosis and a passing rerun. These are integration blockers in the ongoing peer task, not failures of this documentation branch. File lines and contents may move before its final commit; recheck the final handoff and do not weaken permission admission to satisfy fixtures.

A subsequent isolated `node --experimental-strip-types --test tests/a17-integrated-delivery.test.mts` advanced through proof-bearing intake and signed bounce/complaint callbacks, then failed at line 196: it expected two new `non_sendable` deliveries but observed zero. Proposed migration 040 filters suppressed recipients before delivery claim. Assert that the later suppressed visits create no additional attempts/provider calls while earlier terminal bounce/complaint evidence remains intact. This diagnoses the isolated assertion failure; it does not establish the cause of the earlier combined-run 400. Require both isolated and combined passing results on the final permission commit.

Integration must rerun Quality/Security on the final combined SHA and obtain an exact deployment receipt separately. No merge, shared roadmap update or deployment is part of this branch. Fresh natural health and actual A12 removal are now verified; peer implementation acceptance remains with the separate task and final integration review.
