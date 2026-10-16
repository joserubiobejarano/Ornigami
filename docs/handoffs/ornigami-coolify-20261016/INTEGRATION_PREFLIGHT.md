# Publication preflight — integration checks completed

Revalidated before both repaired-trial pushes on 16 October: protections remained effective; correction publication started no run/deployment, then one separate request-only push started the approved trial. Post-trial checks found no deployment and zero Coolify resources. See [repaired-trial identities, gates and receipts](./REPAIRED_TRIAL.md). This historical preflight is not authorization for another push/run.


Outcome: the cleared first push and the sole approved request push have occurred. The [external trial report](./EXTERNAL_TRIAL.md) records the admission failure, downloaded evidence and unchanged deployment gates. The earlier pause/resumption instructions below are historical; the original one-trial approval is consumed.

## Current result: cleared for the approved preparation push

16 October 2026, approximately 16:53–16:58 UTC, after owner Netlify sign-in. The account's team switcher shows one team, `joserubiobejarano`. Its unfiltered project inventory lists four projects, and each project's Developer settings → Repository card explicitly states **Current repository: Not linked**:

- `elastic-bartik-99fd7d`
- `distracted-joliot-36e072`
- `eloquent-curran-4666ab`
- `elastic-beaver-e31029`

No Netlify project in this account is linked to Ornigami or any Git repository, so the installed Netlify App has no site to deploy from this branch. The owner states they have no other Netlify account. No site, repository connection, permission, branch rule or provider setting was changed. The four local `netlify-<project>-repository.txt` receipts contain the same rendered card text, each SHA-256 `601e40b839221897e5cc4785321ec068421e590f098ef89ac4628a1ca0058ad5`. The project inventory and team-switcher receipts are retained beside them with account email redacted.

Before publication, GitHub again reports public visibility and `main` as default, zero repository webhooks and zero Actions runs on the preparation branch; remote branch is absent. Executable candidate/workflow/lock/Vercel guard are unchanged from the approved SHA. Vercel's live project still points to `joserubiobejarano/Ornigami`, production branch `main`; the candidate blocks this exact preparation branch. Authenticated GitHub inventory identified only the three Apps recorded below; no deployment-capable App remains unidentified.

The private dashboard tunnel had closed. A local `ssh -N` forwarding process using the existing protected configuration restored only `127.0.0.1:18000` access; **no remote shell command** or host configuration/build operation ran. A stale failed browser tab initially retained its connection error; a fresh tab loaded the restored dashboard successfully. Read-only Coolify project/environment views again report zero Ornigami resources. The refreshed AX receipt is `coolify-refreshed-before-publication.txt`. No app exists there to autodeploy. Shared host/proxy/firewall and other projects were not changed.

The owner’s existing conditional approval can now be exercised: publish the preparation branch without a marker, verify no build/deployment started, refresh checks as needed, then push exactly one request-only commit for candidate `51673d76bd407f69fa1a437f1b52587f0a888cfa`. No new approval is required for those already-approved steps. The sections below preserve the earlier access failures and their resolution; they are historical, not current blockers.

Initial check 16 October 2026, approximately 16:41–16:45 UTC; resumed after owner GitHub sign-in at approximately 16:49–16:52 UTC. The owner approved branch publication and one request-only trial for candidate `51673d76bd407f69fa1a437f1b52587f0a888cfa`, conditional on checking deployment integrations before either push. That approval persists. It has **not been exercised**: the App inventory is now checked, but newly discovered Netlify deployment behavior remains unverified.

## Resumed check: GitHub accessible, Netlify remains unverified

The authenticated repository installation page lists exactly **coderabbitai, Netlify and Vercel**. Installation configuration pages show all three have access to all repositories, including Ornigami. No installation selection, permissions, suspension or uninstallation controls were changed, and no pending permission update was accepted.

| App | Installation | Observed access / deployment implication |
| --- | --- | --- |
| coderabbitai | `84505349` | Read actions/checks/discussions/metadata; write code/statuses/issues/PRs. Described workflow is PR review; no deployment or actions-write permission is shown. No PR is being opened. |
| Netlify | `7102738` | Read code/metadata, write checks/statuses/PRs; all repositories. Its page describes automatic builds/deployments on Git pushes. App installation alone does not prove an Ornigami site exists or that this preparation branch is excluded. **This is the current blocking uncertainty.** |
| Vercel | `80672078` | All repositories, including deployment/hook permissions. Earlier live project inspection and the candidate's exact branch block still apply; refresh before publication. |

No Netlify CLI/connector is available. `https://app.netlify.com/` shows a login page. Trying its GitHub login reached an **Authorize Netlify Auth** screen requesting read-only email-address access; that new grant was not accepted. The authorization was cancelled and the Netlify login page left open for the owner to use their existing account. No credentials or OAuth callback/state values are retained in the evidence.

The repository webhook list remains empty. At 16:51 UTC, `git ls-remote` still showed no preparation branch; the request marker remains absent. No push or trial occurred. Source candidate and executable workflow/runtime files are unchanged. The earlier observations below are historical receipts, not current claims that GitHub remains signed out.

New local receipt hashes under the same ignored evidence directory:

| File | SHA-256 |
| --- | --- |
| `github-installed-apps-signed-in.txt` | `39eeaab830de908efdacf523c352066f24c0384d518b1b95bbc2963ff8103f36` |
| `netlify-github-installation.txt` | `7d6dd03bc00222f666265e4ede36d4c92d698bd603d9b441f805a5da6191cf0f` |
| `coderabbit-github-installation.txt` | `0e5ab1905498500409c70a6fb29b1daad497d85e41b29e53ca5547e35710e85d` |
| `vercel-github-installation.txt` | `7898cc85a863ca370f11629a4cdb2545ea1fdccb8400697331b661e14094632a` |
| `netlify-sign-in-required.txt` | `f439ef07fd34d90109934e9aea0b2711a95c3130b8558b1164c0f7eb6f7b9528` |

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

The previously missing Netlify access is resolved by the current result above. Do not grant broader access, regenerate tokens or modify shared settings to bypass any new uncertainty. If another external watcher is identified, verify its branch exclusion before publication; otherwise stop with its specific uncertainty.

Once that condition is satisfied, refresh the read-only integration checks immediately before publishing; execute the already-approved [publication/run procedure](./RUN_APPROVAL.md) without requesting the same approval again. The candidate remains unchanged. After the first push, verify no build/deployment started before creating the single request-only commit. Capture the one trial's summaries/logs while available, including failures; do not retry, increase limits or publish an image. There are no new build, scan, HTTP, restart/cache, memory or disk results in this preflight because the trial has not started. Original failed-build evidence and all outstanding advisory/release gates remain unchanged.
