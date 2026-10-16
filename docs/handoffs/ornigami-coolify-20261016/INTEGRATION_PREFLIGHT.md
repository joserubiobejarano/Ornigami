# Publication preflight — stopped before first push

Checked 16 October 2026, approximately 16:41–16:45 UTC. The owner approved branch publication and one request-only trial for candidate `51673d76bd407f69fa1a437f1b52587f0a888cfa`, conditional on checking deployment integrations before either push. That approval persists. It has **not been exercised**: the GitHub App installation inventory cannot yet be checked with available authentication.

## Evidence

| Check | Observed result | Limit |
| --- | --- | --- |
| Local candidate | Clean worktree at `ca148975876849e07e483c22e5357141389e4eb3`; approved candidate is its parent; request marker absent | No source/configuration changed by this preflight |
| Remote publication | `git ls-remote --heads origin refs/heads/codex/ornigami-coolify-preparation-20261016` returned no ref at 16:45 UTC | No first push performed |
| Repository | GitHub REST reports public visibility, default branch `main`, owner CLI has repository admin/push permission | Admin repository permission does not provide the App installation inventory |
| Repository webhooks | `GET /repos/joserubiobejarano/Ornigami/hooks` returned `[]` | Does not enumerate GitHub Apps or external polling watchers |
| GitHub Apps | `GET /user/installations` returned HTTP 403: the token must be authorized to a GitHub App to list installations | **Blocking unknown:** installed Apps, their Ornigami repository access, and their deployment/branch behavior |
| Owner browser | Repository installation settings showed logged-out GitHub/Sign in; no signed-in owner session was available in the selected browser | A GitHub owner sign-in page is left open for authentication; no credentials were read or entered |
| Vercel live connection | Authenticated CLI discovered project `locallift`, ID `prj_b4ud7KOZHWQeV9YXbGD3c8XMmKIv`; filtered `GET /v9/projects/{id}` reports GitHub `joserubiobejarano/Ornigami`, repository ID `1098540125`, production branch `main`, root directory `.` | This confirms the connection; it does not enumerate every App/external watcher |
| Vercel branch guard | Approved candidate's `vercel.json` has only `git.deploymentEnabled["codex/ornigami-coolify-preparation-20261016"] = false` | The [official Git configuration contract](https://vercel.com/docs/project-configuration/git-configuration) supports this branch-specific block; no live setting was changed |
| Coolify live inventory | Read-only owner browser inspection through the existing tunnel: project `vqkyv5dpjpjazuknkgyunioi`, environment `d9ixeysd9tajcavvibltt3is`, “0 resources in Ornigami” / “No resources yet”; project inventory also shows zero Ornigami resources | No Ornigami app/resource exists there to autodeploy; does not prove absence of unrelated external automation |
| Workflow/config review | Rehearsal is exact branch + request-path only; CI/security push skip that branch; existing cron workflows have no branch-push invocation; candidate workflow permissions are empty | Does not substitute for installation inventory |

Vercel's listing also reports an existing production alias at `https://ornigami.com`. This observation is not acceptance of a new Coolify origin, DNS routing, TLS or provider registration, and does not change any origin/callback gate.

Only read-only GitHub/Vercel API/CLI and Coolify dashboard views were used. No SSH command, tunnel startup, host build, resource creation, configuration write, deployment, provider operation or cron invocation occurred. No shared host settings or other project's resources were changed. Initial attempts to inspect a Vercel project literally named `ornigami` failed; the authenticated project listing established its actual name `locallift` before the successful inspection. No Vercel link/create command was run.

## Preserved local browser receipts

Raw AX text and a Coolify screenshot are retained in ignored `.local/coolify-preparation/integration-preflight-20261016/`. No credentials, cookies, tokens or session stores were inspected. These local receipts are not application image artifacts or runner evidence.

| File | SHA-256 |
| --- | --- |
| `coolify-empty-environment.txt` | `0446a83590dd70325db7db11c0c934421ca4decf54ea486222b3ee01aa4a57b1` |
| `coolify-empty-environment.png` | `8b3187ccdcd23204a0067410d52961b03146e373aff308a6d6b893ad17021cba` |
| `github-installations-signed-out.txt` | `66c619e419eaf6d83f408469a903b2114800d168eec5dc70336626c62ed3987c` |

## Resume without repeating approval

The missing dependency is authenticated read access to the repository's GitHub App installation settings. Sign in as the owner in the in-app browser and inspect the installed Apps and any deployment-capable integration's repository/branch configuration. Do not grant broader access, regenerate tokens or modify shared settings to bypass this check. If another external watcher is identified, verify its branch exclusion before publication; otherwise stop with its specific uncertainty.

Once that condition is satisfied, refresh the read-only integration checks immediately before publishing; execute the already-approved [publication/run procedure](./RUN_APPROVAL.md) without requesting the same approval again. The candidate remains unchanged. After the first push, verify no build/deployment started before creating the single request-only commit. Capture the one trial's summaries/logs while available, including failures; do not retry, increase limits or publish an image. There are no new build, scan, HTTP, restart/cache, memory or disk results in this preflight because the trial has not started. Original failed-build evidence and all outstanding advisory/release gates remain unchanged.
