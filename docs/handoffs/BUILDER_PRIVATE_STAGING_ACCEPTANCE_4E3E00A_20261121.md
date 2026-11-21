# Synthetic private staging acceptance — 4e3e00a — 21 November 2026

**Synthetic staging: GO for the tested private-edge scope on the authorized Linux
host. Real-customer admission: NO-GO.** Access was closed after verification.
No registry publication, deployment, DNS change, real invitation or paid call
was made.

## Exact source, run and host

| Item | Value |
| --- | --- |
| Reviewed source SHA | `4e3e00af212a3d97de582ab6fca6ecca8d0665dd` |
| Reviewed staging package | `f73e93fccb42d1752d77e51e9e6374752b4f23d6` |
| Approved source ref before dispatch | `refs/heads/codex/ornigami-builder-private-staging-20261121` |
| Run ID | `44845147243` |
| Job ID | `136662900228` |
| Run URL | <https://github.com/joserubiobejarano/Ornigami/actions/runs/44845147243> |
| Run result | **success** |
| Started/finished | `2026-11-21T00:38:19Z` / `2026-11-21T00:41:43Z` |
| Rehearsal workflow | temporary `.github/workflows/builder-private-staging.yml` on `main` at `500e91b4390c72b3a3d1a6599649320511704c7f` |
| Host | GitHub Actions `ubuntu-24.04` |
| Kernel / architecture | `Linux 7.0.0-1014-aws x86_64` |
| OS / resources | Ubuntu 24.04.5 LTS; 4 CPUs; 16,078,420 KiB |
| Host Node / npm | `v22.23.3` / `10.9.9` |
| Host Docker | client/server `28.0.4` |
| Host user | builder/qualification user `ubuntu` |

The host was the authorized Linux rehearsal runner, not a dedicated public VPS.
The approved hostname was mapped to loopback on that host and served by a real
Caddy edge with a private internal CA. Public DNS, public ACME TLS and a public
VPS route were **not** created or verified.

## Image identity and toolchain

| Item | Value |
| --- | --- |
| Image tag | `ornigami-builder:staging-44845147243-1` |
| Local image ID | `sha256:f9a28737303852399ea604d569bd08c6ebc9293a75e4c01852f419f36ba40d12` |
| Revision label | `4e3e00af212a3d97de582ab6fca6ecca8d0665dd` |
| Origin label | `https://builder-staging.ornigami.com` |
| Platform / user | `linux/amd64` / `1000:1000` |
| Retained archive SHA-256 | `9fbf72ae11f64177587c65417968a5ba5b6237475a829726edae671da2c55a56` |
| Retained archive size | 999,698,432 bytes |
| Image Node / npm / OpenSSL | `22.23.3` / `11.21.1` / `3.5.8` |
| Framework | Next.js `16.4.5` |
| Caddy edge | `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |
| Registry digest | **none**; local image ID and archive SHA are not a registry repo digest |

The image was built from the exact source with `APP_URL=https://builder-staging.ornigami.com`
and verified against the approved origin, revision, platform and user labels.
The local archive was retained on the runner only; it was not uploaded or
published.

## Phase evidence

### Closed access before rehearsal

```text
home=200
builder=404
session=401
closed_before_access=true
```

### Private edge, TLS, access and CSP/SRI

All 12 edge checks passed:

- TLS verification against the private Caddy CA;
- HTTP-to-HTTPS redirect to the approved hostname;
- anonymous and wrong-credential denial (`401` BasicAuth);
- authorized `200` and HSTS/CSP headers;
- anonymous builder `307`, session `401`, generation `404`;
- unexpected Host rejected (`421`);
- initial script SRI verification.

### Invite-mode smoke

```text
home=200
builder=307
builder_location=/?error=session
session=401
generation=404
```

### Full browser/ZIP/revocation journey

All **24** browser checks passed, including:

- origin reachable, CSP, initial and post-generation SRI;
- generation, refresh/edit generation, two-tab generation;
- idempotency replay `409`;
- fresh approved ZIP: `browser-a.zip`, 14 entries / 13 files, 285,077 bytes,
  export revision `3ffb03a5135b1d43`;
- online subject-A revocation: workspace and second tab cleared, no workspace
  text, generation denied;
- subject B remained active and could generate;
- sign-out returned to the origin root and cleared storage.

### Live runtime isolation and volume

All 14 runtime checks passed:

- app read-only root, user `1000:1000`, revision/origin labels;
- no published app port; app network internal;
- public egress denied;
- no provider/database/mail/Sentry environment;
- volume label present; root `1000:1000:700`; store file `1000:1000:600`;
- Caddy publishes only 80/443 and shares the internal app network.

### Populated restore, lock recovery and closed rollback

The actual-origin partial harness passed **47 checks**:

- stopped backup and populated fresh-volume restore;
- restore root `1000:1000` mode `0700`; store `1000:1000` mode `0600`;
- restore hash and records preserved;
- foreign-scope lock recovery with store unchanged and readable;
- same-image closed rollback preserved store and all records;
- `egress_blocked=true`, `single_replica=true`;
- `browser_journey=skipped`, `full_acceptance=false`,
  `acceptance_scope=partial` by design; the separate browser phase above supplies
  the browser/ZIP evidence.

### Closed access after verification

```text
home=200
builder=404
session=401
closed_after_access=true
store_volume_preserved=true
access_closed=true
```

The app/proxy containers and networks were removed; the named store volume was
preserved. The Caddy CA and temporary hosts mapping were removed. No registry
publication, deployment, DNS change, real invitation or paid call occurred.

## Evidence paths

Actions artifact (30-day retention):

- Name: `builder-private-staging-44845147243-1`
- ID: `14683346002`
- Size: 871,542 bytes
- URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44845147243/artifacts/14683346002>

Local retained copy:

- Root: `.local/builder-private-staging-20261121/run-44845147243/`
- Results: `builder-private-staging-44845147243-1/results.txt`
- Host/config: `.../host.txt`, `.../caddy/repo-digests.txt`, `.../caddy/nss-ca-list.txt`
- Image identity: `.../image/image-identity.json`, `.../image/verified-identity.txt`
- Edge: `.../edge/edge-results.json`, `.../edge/edge-results.txt`
- Browser/ZIP: `.../browser/results.json`, `.../browser/ACCEPTED.txt`,
  `.../browser/downloads/browser-a.zip`, `.../browser/extracted/`,
  `.../browser/screenshots/`
- Runtime: `.../runtime/checks.tsv`, `.../runtime/results.txt`
- Restore/lock/closed: `.../rollback/results.txt`, `.../rollback/PARTIAL.txt`,
  `.../rollback/checks.tsv`, `.../rollback/list-*.json`,
  `.../rollback/backup/`, `.../rollback/store-export/`
- Closed smokes: `.../closed/smoke-closed-before.txt`,
  `.../closed/smoke-closed-after.txt`, `.../closed/invite-smoke.txt`
- Access closure: `.../access-closed.txt`, `.../volume-after-close.json`
- Full run log: `.local/builder-private-staging-20261121/run-44845147243.log`

## Decisions

- **Synthetic staging: GO** for the tested private-edge scope on the authorized
  Linux rehearsal host. The exact source/origin image, private BasicAuth edge,
  closed-before/after states, both access modes, egress controls, packaged
  operator revocation, browser/ZIP evidence, populated restore, lock recovery
  and same-image closed rollback all passed.
- **Public/real staging route: NO-GO / not tested.** Public DNS, public ACME TLS,
  a dedicated VPS route and registry publication remain separately unauthorized.
  The tested origin was loopback-mapped with a private CA, not a public edge.
- **Real-customer admission: NO-GO.** Customer retention/deletion, encrypted
  off-host backup and key custody, deletion-journal replay, support routing,
  customer notice acceptance and a permanent Next maintainer are still open, and
  only synthetic data/invites were used.

Real invitations and paid calls remain for separate approval. Registry
publication, deployment and DNS changes also remain separately authorized.
