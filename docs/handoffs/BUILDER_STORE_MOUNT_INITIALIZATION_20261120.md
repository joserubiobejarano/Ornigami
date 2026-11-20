# Builder mounted-store initialization correction

20 November 2026. Local source correction plus a real mount-only check. No full
rehearsal, deployment, registry publication, DNS change, real invitation or paid
call occurred. Application behavior and default closed access are unchanged.

## Exact source

- Branch: `codex/ornigami-builder-store-mount-20261120`
- Base: `b74ba387bcef397984530146181b9c8bcd2446ea`
- Candidate code SHA: `5b335bc35c22240e9137705ab66a273b13559e1d`
- Worktree: `C:/Users/joser/.local/ornigami-builder-store-mount-20261120`
- Retained failure handoff: `84fb792c` and run `44811515570` at `b74ba38`.

This handoff is documentation-only after the candidate code SHA. The next full
Linux run must checkout the candidate SHA itself.

## Retained failure

Run `44811515570` passed the full suite (`1403/1403`, zero skips), image
identity, read-only root, UID/GID `1000:1000`, the invite HTTP smoke and
`writable:store:owner`. It then failed:

```text
PASS writable:store:owner
FAIL: writable:store:mode: expected [700], got [755]
```

The named-volume root did not inherit the image directory mode on Docker
`28.0.4`. The failure stopped the phase before the other three writable paths.

## Corrections

- After creating the run-owned primary or restore named volume, the script now
  verifies the `org.ornigami.qualify.run` label before modifying it. A foreign,
  wrong or unowned volume is refused.
- A narrow one-shot setup container runs as `0:0` with `--network none
  --read-only` and only the new volume at `/data/builder`. It chowns the root to
  `1000:1000`, chmods it to `0700`, and verifies the result before any writer
  starts or before backup data is imported.
- Fresh bind mode initializes `STORE_DIR` and `RESTORE_DIR` directly on the host
  to `1000:1000` mode `0700` before use. Linux verifies the actual owner/mode;
  the Windows stub skips POSIX mode reporting but exercises ordering.
- The writable-path phase now collects owner, mode and write/delete results for
  all four paths before failing. A probe error is recorded as a failure without
  aborting the remaining probes. The original tmpfs settings are preserved:
  `rw,noexec,nosuid` with `uid=1000,gid=1000,mode=0700`.
- Fresh-volume restore now verifies the restore root `1000:1000` mode `0700`,
  the store file `1000:1000` mode `0600`, the store hash, and subject/session/
  usage record preservation against a list captured before backup.
- `MOUNT_ONLY=1` stops after the real image, primary-volume initialization,
  invite runtime start and four writable-path probes. It is a real mount
  preflight, not full acceptance.
- The local self-test now covers new-volume initialization before writer start,
  restore initialization before import/writer start, unowned-volume refusal, and
  setup failure before the writer container. The stub engine supports only the
  narrowly scoped setup run and rejects an unscoped run.

## Evidence, labelled separately

### Stub/local evidence

| Check | Result |
| --- | --- |
| Builder qualification self-test | **13/13 pass** |
| Focused builder/operator/isolation/store/HTTP suites | **38/38 pass**, 0 skipped |
| `npx tsc --noEmit` | pass |
| Shell/Node syntax checks | pass |
| Retained full suite at base `b74ba38` | **1403/1403 pass**, 0 skipped |

### Real mount evidence

Run `44820076971`, workflow ref `ci/ornigami-builder-mount-check-20261120`,
candidate `5b335bc35c22240e9137705ab66a273b13559e1d`, Docker `28.0.4`:

- Run URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44820076971>
- Result: **success**, `mount_only=true`, 21 checks.
- Local image ID: `sha256:345b78b9631d31c00eb6e9f9457d61a9ca72036e9c71c45a67c2363877d91918`
- Revision label: `5b335bc35c22240e9137705ab66a273b13559e1d`

All real path checks passed:

| Path | Owner | Mode | Write/delete |
| --- | --- | --- | --- |
| `/data/builder` | `1000:1000` | `700` | pass |
| `/tmp` | `1000:1000` | `700` | pass |
| `/app/builder-runtime/.next/cache` | `1000:1000` | `700` | pass |
| `/home/node` | `1000:1000` | `700` | pass |

The mount-only run also passed image labels, read-only root, runtime UID/GID and
the invite HTTP smoke. It did not claim full acceptance and did not run egress,
operator/browser/ZIP, restart, restore, lock recovery or closed rollback.

Local copies:

- `.local/builder-store-mount-20261120/run-44820076971-real-mount/` — real
  mount-only artifact, console log, `results.txt`, `checks.tsv`, image identity.
- `.local/builder-store-mount-20261120/` — local focused/stub logs.

## Next full Linux command

```bash
git checkout 5b335bc35c22240e9137705ab66a273b13559e1d
git status --porcelain                       # must be empty

SOURCE_SHA="5b335bc35c22240e9137705ab66a273b13559e1d" \
APP_URL="http://127.0.0.1:3100" \
BROWSER_PHASE=1 \
  ./deploy/builder/qualify-linux.sh
```

The full run must still prove fresh-volume restore root `0700`, store file
`0600`, hash/record preservation, egress denial, operator/browser/ZIP, restart,
lock recovery and closed rollback. Dispatch of that full rehearsal, deployment,
registry publication and DNS changes remain separately authorized.
