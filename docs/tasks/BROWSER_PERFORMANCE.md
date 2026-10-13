# Browser performance improvements

Task branch: `task/browser-performance`, isolated worktree `Ornigami-Browser-Performance`, based on main `3022643`. Scope: Review Replies settings layout stability and connection requests, and inbox startup sequencing. Integration owns merging, the shared roadmap and deployment.

## Changes

- Reply settings render the same four fields and save action during loading. Controls stay blocked until the initial settings read succeeds; failed reads expose a reload action. Save failures still permit retrying the save.
- The Google connection read waits for a successful settings read and an explicit business ID. Overlapping reads share an in-flight request within the hook instance. Reloads after sync, selection or disconnect force a fresh read; stale responses cannot replace the current scope. Refreshes keep the existing layout while pending.
- The connection card reserves a minimum content height during loading. The inbox starts authenticated default-scope settings and stored-location reads concurrently, then requests reviews with the resolved business ID. A failed initial location read gets one scoped retry after successful settings resolution, covering first-workspace creation. Pagination and draft reconciliation remain unchanged.

## Validation

The review loop covers both response orders, the workspace-creation race, failed reads and retries, unmounts, scope changes, overlapping connection requests, pagination, and preservation of unsaved draft edits. Production browser measurements use the existing loopback A20/A23 synthetic fixture and mobile lab; no customer data or provider operations are involved.

Final commands and measurement results will be recorded with the task receipt after the production candidate is built and checked. The earlier baseline is `docs/tasks/mobile-browser-performance-evidence.json` and its interpretation is in `MOBILE_BROWSER_PERFORMANCE.md`; it measured settings maximum CLS 0.1317, two connection reads per settings navigation, and a settings → locations → reviews inbox chain.

## Review and rollback

Review the branch commits and task evidence, then integrate through the separate integration session. Revert the application changes to restore the former loading behavior. No schema, package dependency or deployment configuration changes are required. Local lab timings describe the synthetic fixture and do not certify field CWV or deployed network performance. Duplicate session reads were investigated but left unchanged because no clear local cause was established in the shared session provider.
