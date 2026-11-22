# Exact-candidate rehearsal readiness repair — 22 November 2026

Status: **two full synthetic Linux attempts were executed and both failed at the
candidate test gate. No image or archive exists. Remote execution is stopped.
Another full attempt requires expanded approval. Customer admission remains
closed.**

## Frozen identities

| Object | Identity |
| --- | --- |
| Execution-bundle baseline | `820aae6d41ccc9e7127c095f3a097904a44d0c5e` |
| Candidate | `863a8a77d7a6b71b72a4140f6fd9b2ff8ef11816` (parent `0d685513`) |
| Candidate merge | `87a064e9856da169f691306379f2120e78c22981` |
| Gate-debug bundle | `48d3e9a7cfcfa3d983b1f401bb98ea774fb65092` |
| Final codex bundle tip | `c3d98ab058b3451d7a6f12599197855c7f0fcf63` |
| Second full-run request commit | `fadf1072eb9f299a98370b80827e0daa0905daf6` |
| Second full-run branch | `ci/builder-exact-rehearsal-0d68551-qualify-20261122` |
| Second full run | `45022904023` |
| First full run | `44980225963` |
| Gate-debug run | `45022113531` |

The candidate correction is mode/content only: directly invoked helpers are
`100755`, direct child-shell calls use `bash`, and the loopback proxy profile
is forwarded. No application behavior change. Previous branches, runs and
artifacts are preserved.

## Root causes repaired

1. **DinD readiness was never waited for.** The old loop treated `docker info`
   exit status `0` as success. Debug evidence showed exit `0` with empty stdout
   and `Cannot connect ...` on stderr. The new probe requires a non-empty daemon
   ID, has per-attempt timeout and overall deadline, and retains classification
   and bounded diagnostics.
2. **The candidate gate inherited the live rehearsal environment.** The helper
   is a child process, so clearing selectors cannot affect later checkpoint or
   qualification phases.
3. **PostgreSQL was not propagated.** `A04_PG_BIN`/`PG_BIN` now reach the builder
   test process; `initdb` and `postgres` must be executable before the suite.
4. **The lock test still inherited `BUILDER_RUNTIME_STORE_HOST_ID`.** The live
   store ID made the test lock's hostname fail the same-host comparison, so the
   dead owner was never reclaimed. The gate helper now clears all
   `BUILDER_RUNTIME_*`, store, volume, project and browser variables.
5. **PG server logs were not retained.** Candidate `.next/**/postgres.log`
   files are copied into staging (bounded to 1 MiB each) during cleanup.
6. **Closure observation could race teardown.** Origin/listener closure now
   retries for a short bounded period before recording failure.

## Linux evidence

Gate-debug `45022113531` ran the exact builder → `run-candidate-gates.sh`
command with deliberately contaminated selectors:

```text
candidate_gate_pg_bin=/usr/lib/postgresql/17/bin
candidate_gate_initdb=/usr/lib/postgresql/17/bin/initdb
candidate_gate_postgres=/usr/lib/postgresql/17/bin/postgres
candidate_gate_test_count=216
candidate_gate_test_concurrency=1
candidate_gate_rehearsal_selectors_cleared=true
candidate_gate_status=pass
# tests 1460
# pass 1460
# fail 0
# skipped 0
```

Readiness in the full runs remained green: distinct build/host daemons, loopback
profile accepted, cross-profile rejected, private store modes `0700/0600`,
export staging `2770`, and builder/runner identities distinct.

## Full attempt outcomes

### `44980225963` (first)

Passed trigger, checkout, ancestry/modes, readiness, ownership preflight and
the pre-installation gate. Failed the candidate suite with 10 failures: two
PostgreSQL path failures, seven leaked-`BUILD_ENDPOINT` fixture failures, one
lock timeout. No image or archive.

### `45022904023` (second)

Passed the same early gates and reached the candidate suite. Final counts were
`1460 tests, 1458 pass, 2 fail`:

- `atomic runner serializes real PostgreSQL quota claims and safely recovers
  sends`: `pg_ctl ... start` failed. The disposable server log was not retained
  from this run; retention was added afterwards.
- `a lock owned by a provably dead process is reclaimed`: timed out because the
  gate still inherited `BUILDER_RUNTIME_STORE_HOST_ID`; fixed after the run.

No image, checkpoint, edge, qualification, archive or retrieval occurred.
`final_status=1`, `cleanup_failures=0`,
`reason=preserved_primary_failure`.

## Custody

| Run | Artifact | Size | Expiry |
| --- | --- | --- | --- |
| `44980225963` | `builder-exact-rehearsal-0d68551-readiness-44980225963-1-diagnostics` | 86,086 B | `2026-11-29T03:24:51Z` |
| `45022904023` | `builder-exact-rehearsal-0d68551-readiness-45022904023-1-diagnostics` | 85,319 B | `2026-11-29T12:38:47Z` |
| `45022113531` | `builder-gate-debug-45022113531-1` | bounded | seven days |

Local retained copies are under `.local/retained/`.

## Remaining blocker and next step

The lock failure has a demonstrated environment cause and a local fix with an
executable regression. The PostgreSQL `pg_ctl start` failure occurred only in
the full job (the same test passed in the no-DinD gate-debug); the missing
server log is the blocker to proving whether it was a port/resource interaction
with the full job environment. A future attempt should capture the retained
`postgres.log`, and preferably run the gate in the no-DinD job that already
passed, then continue conditionally into the DinD build. This requires expanded
approval; no further remote execution was attempted.

Public hosting and customer admission remain out of scope.
