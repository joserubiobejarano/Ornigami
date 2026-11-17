# Campaign Lab local-approval integration receipts — 17 November 2026

This receipt file lives on the temporary evidence branch and does not change the
tested source commit. Deployment, traffic, DNS, provider actions and production
data changes remain out of scope.

## Source identity

| Item | Value |
| --- | --- |
| Final tested source SHA | `736be5607ca8346dd84c3247a0caf25d06e48f55` |
| Source tree | `6be1190faa5999cd1ce5ef4a0cb2a9ff81a2c5a5` |
| Integration merge | `a53b37ac0871ec37cff534f518307973fc653d16` (parents `fbc43f6`, `428083c`) |
| Test-harness follow-up | `ce1b99835fecab87eb926d2c39d98a8080f5fd36` |
| `18b6f2f` ancestor | **yes**, proved before CI and re-proved in the Linux receipt |
| `428083c` ancestor | **yes**, proved before CI and re-proved in the Linux receipt |
| `package-lock.json` SHA-256 | `63c735ef9283fc20518cdc261cff793369c99c8f860f2feae7c40306d8beca02` |
| `package-lock.json` Git blob | `adf6efff9b051fb927a3971a74e996525e77fbcc` |
| Next.js source tarball | `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`, 44,840,348 bytes |
| Next.js source tarball SHA-256 | `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28` |
| Installed Next.js version | `16.4.5` |
| Installed `node_modules/next` aggregate, local Windows clean install | `28ed4a42361f7e79ea8ececb331440f315379d73769457d1195264d0952006f7` (8,715 files, npm `11.6.2`) |
| Installed `node_modules/next` aggregate, Linux/Node 22 receipt | `0ed89dbf0f127239b5350693772b963f3836ec1473dc43d058206d345129ce13` (8,715 files, npm `10.9.9`) |

The two installed-directory aggregate hashes differ because the clean installs
used different npm versions; the locked tarball hash, version and lockfile are
identical.

## Receipt links

| Workflow | Run | Binding | Result |
| --- | --- | --- | --- |
| Quality checks | https://github.com/joserubiobejarano/Ornigami/actions/runs/44068106709 | Push on `736be56` | Success |
| Security checks | https://github.com/joserubiobejarano/Ornigami/actions/runs/44068106774 | Push on `736be56` | Success |
| SRI Linux receipts (temporary) | https://github.com/joserubiobejarano/Ornigami/actions/runs/44068350201 | `workflow_dispatch` on evidence branch `327da73`, `source_ref=736be56`; receipt `source-sha.txt` records `736be56` | Success |

Receipt artifact retained under the integration worktree's Git-ignored
`.local/ci-receipts/sri-linux-44068350201/`; summary SHA-256
`7c82dffa591e71542783561a7173693f4e1cff9db148e29bd0f69c36fcd21a45`.

## CI results on `736be56`

- Quality: lint 0 errors / 26 existing warnings; type generation and TypeScript
  passed; **1,051 tests, 1,037 passed, 0 failed, 14 skipped**; clean build with
  24/24 static pages; production smoke passed.
- Security: full and production dependency audits both 0 findings and exit 0;
  security tests **7/7 passed**.
- Linux/Node 22: Node `v22.23.3`, npm `10.9.9`, Ubuntu 24.04 x86_64; SRI check
  passed on **31** same-origin scripts across `/` and `/login`, 0 issues; CSP
  nonce rotation distinct; production smoke and A19 runtime CSP smoke passed.
- Home and login: both `200` with CSP nonce.
- Campaign Lab production gates: `/campaign-lab`, `/campaign-lab/offer` and
  `/campaign-lab?fixture=sparse` returned `404`; `POST
  /api/campaign-lab/generate` returned `404` with
  `{"ok":false,"message":"Campaign Lab is unavailable."}`.
- Private pilot asset gate:
  `/campaign-lab-pilots/momisa/momisa-glow-box-front.jpg` returned `404`.
- SRI fixture: **9/9** checks passed.
- Rollback rehearsal: prior compiled-dist artifact failed on `global-error`,
  `error` and `page` chunks; `rollbackVerified=false`.

### Skipped checks

The 14 skips are the existing `tests/coolify-runtime-acceptance.test.mjs`
runtime/cleanup checks. They skip because the harness tests `existsSync("bash")`
against a relative path instead of resolving `bash` on `PATH`. No failures.

## Local browser results on the combined development build

- Local approval: **30/30 passed** at 375 and 1440 px. Generated revision
  `4b1c3fae06bc1444`; edited/approved revision `e96297b272818742`; approval
  recorded that exact revision; editing cleared approval while keeping the old
  revision visible; Amazon/search revision `1f5e6c0adf8e9af3` retained the
  provisional footer and local-preview label; 0 console errors.
- Offer acceptance: **144/144 passed** at 375 and 1440 px; qualified offer
  `20% off, 27–30 November 2026, 1 December 2026` rendered exactly at revision
  `428d373af4`; approval matched the revision and the edit invalidated it.
- Advertorial acceptance: **200/200 passed** across 320, 375, 768, 1024 and
  1440 px, including wrong-packshot rejection, edit invalidation and exact
  revision approval. A local Momisa pilot was staged only under ignored
  `.local/` for the offer-only path.

Test-only follow-up `ce1b998` kept the offer edit inside the safe dated-discount
subset, waited for lazy advertorial images before approval, and matched the
current advertorial-gap copy. Product behavior was unchanged.

## Canary stop and ownership

The tested fail-closed canary stop procedure is carried forward from
`fbc43f6`/`docs/RELEASE_EVIDENCE.md`: stop promotion and intake; remove or
zero-weight only the canary route; return traffic only to an owner-accepted
target or keep the candidate stopped and private; preserve the exact source,
artifact hashes, failed logs and edge state; rebuild or re-review before
recovery. Do not substitute either unverified 16.4.5 artifact or the vulnerable
16.4.2 artifact.

Custom Next.js patch ownership remains **unassigned**. No named maintainer has
accepted rebases of `next-16.4.5-sri.patch` or retesting/publishing the app-owned
artifact.
