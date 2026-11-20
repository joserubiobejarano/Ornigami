# Builder host connection diagnosis and correction

20 November 2026. Real Linux diagnostic and full qualification evidence. No
deployment, registry publication, DNS change, real invitation or paid call
occurred. Application routes, auth, quota behavior and default closed access are
unchanged.

## Exact source

- Branch: `codex/ornigami-builder-store-mount-20261120`
- Base: `5b335bc35c22240e9137705ab66a273b13559e1d`
- Candidate code SHA: `4e3e00af212a3d97de582ab6fca6ecca8d0665dd`
- Worktree: `C:/Users/joser/.local/ornigami-builder-store-mount-20261120`

This handoff is documentation-only after the candidate code SHA.

## Retained failures

Runs `44821873780` and `44822953577` at `5b335bc` passed in-container HTTP and
reached the browser phase, then failed with:

```json
{ "ok": false, "error": "fetch failed", "checks": [] }
```

The old code did not retain the nested Node fetch cause. The retained container
inspection shows the real cause: Docker accepted
`HostConfig.PortBindings.3000/tcp = 127.0.0.1:3100`, but
`NetworkSettings.Ports` was empty and no host listener existed. Docker silently
does not publish ports on an `--internal` network. In-container HTTP worked;
host TCP/HTTP never had a listener.

The new helper records the underlying failure shape. A local closed-port control
(`.local/builder-host-connection-20261120/closed-port-control.json`) captured
`fetch failed` with `code=ECONNREFUSED`, `causeCode=ECONNREFUSED`, `syscall=connect`,
and the loopback address/port, without cookies, tokens or request bodies.

## Supported connection path

The runtime remains on the internal default-deny bridge with no `-p`. The host
runs `deploy/builder/qualify-proxy.mjs`, bound only to `127.0.0.1:<port>`, which
forwards TCP to the runtime's private container IP on port `3000`:

```text
Chromium / host HTTP
  -> 127.0.0.1:3100
  -> qualify-proxy.mjs
  -> private container IP:3000 (internal bridge)
```

The proxy adds ingress only. The runtime has no route to the public network, and
same-origin checks still compare the browser `Origin` with the configured
`http://127.0.0.1:3100`. The browser script waits up to 20 seconds for a `200`
at the exact origin before launching Chromium and records fetch
`code`/`causeCode`/`causeMessage` without cookies or request bodies.

## Evidence

### Real host diagnostic — run `44830270881`

- Candidate: `4e3e00af212a3d97de582ab6fca6ecca8d0665dd`
- Run URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44830270881>
- Result: **success**, `diagnostic=true`, 33 checks.
- Image ID: `sha256:8a5fc0cc8a61f57965c76d8295fa10ed952237a0119b75c1f0df73d3b187909d`
- Revision label: `4e3e00af212a3d97de582ab6fca6ecca8d0665dd`
- Proxy target: `172.18.0.2:3000`
- Host listener: `127.0.0.1:3100` only

Before and after the same-container restart:

| Probe | Before | After |
| --- | --- | --- |
| In-container HTTP | pass | pass |
| Host TCP `127.0.0.1:3100` | pass | pass |
| Host HTTP `http://127.0.0.1:3100` | `200` | `200` |

Live engine evidence recorded an internal bridge (`Internal: true`), healthy
container lifecycle, no published `3000` port, and the loopback-only host
listener. The store hash and reservation state were unchanged across restart.

### Full qualification — run `44829268097`

- Candidate: `4e3e00af212a3d97de582ab6fca6ecca8d0665dd`
- Run URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44829268097>
- Result: **success**, 48 checks, `full_acceptance=true`,
  `acceptance_scope=full`.
- Image ID: `sha256:66a76643adfe116544e239b75840d73333a876621910c13308bfb03fdf4d9fb6`
- Browser readiness: attempt 1, status `200`, 21 browser checks, one ZIP export.
- Restore: root `1000:1000` mode `700`, store `1000:1000` mode `600`, same
  hash, records preserved.
- Lock recovery and same-image closed rollback passed.
- Full suite: 1405/1405 pass, 0 fail, 0 skipped.

Run `44828144829` at `f68827d` passed the script’s 47 checks but the retained
workflow final gate expected the check name `http:smoke:closed`; the candidate
already had `closed:smoke`. Adding the compatibility check name in `4e3e00a`
made the final gate pass. This was a harness naming mismatch, not a product
failure.

### Local evidence

| Check | Result |
| --- | --- |
| Builder qualification self-test | **13/13 pass** |
| Focused builder/proxy/operator/store/HTTP suites | **40/40 pass**, 0 skipped |
| TypeScript | pass |
| Shell/Node syntax | pass |

Local artifacts and downloaded Actions evidence are under
`.local/builder-host-connection-20261120/`.

## Skipped browser phase

`BROWSER_PHASE=0` is partial evidence only. The result contains
`browser_journey=skipped`, `full_acceptance=false` and
`acceptance_scope=partial`; the qualification final gate requires
`browser_journey=true`, so a skipped browser phase cannot pass as full
acceptance.

## Next full Linux command

```bash
git checkout 4e3e00af212a3d97de582ab6fca6ecca8d0665dd
git status --porcelain                       # must be empty

SOURCE_SHA="4e3e00af212a3d97de582ab6fca6ecca8d0665dd" \
APP_URL="http://127.0.0.1:3100" \
BROWSER_PHASE=1 \
  ./deploy/builder/qualify-linux.sh
```

Deployment, registry publication, DNS changes, real invitations and paid calls
remain separately authorized and were not performed.
