# Exact-candidate rehearsal readiness repair — 22 November 2026

Status: **ready for one full synthetic Linux rehearsal. No full rehearsal has
been dispatched from this branch yet. Customer admission remains closed.**

## Frozen identities

| Object | Identity |
| --- | --- |
| Execution-bundle baseline | `820aae6d41ccc9e7127c095f3a097904a44d0c5e` |
| Readiness/execution bundle | `b83a11adba49da76d544d2ae38f229a4913c36c2` (this branch parent) |
| Original application/harness candidate | `0d68551324ce3f441478f613d2f4eb48b9be4f3f` |
| Corrected application/harness candidate | `863a8a77d7a6b71b72a4140f6fd9b2ff8ef11816` |
| Candidate correction parent | `0d68551324ce3f441478f613d2f4eb48b9be4f3f` |
| Preserved historical baseline | `43e2691e7d347d6e48e0ed65c0a828567b24c7a3` |
| Trigger branch | `ci/builder-exact-rehearsal-0d68551-readiness-20261122` |
| Previous failed run | `44977330367` (bundle `820aae6`, candidate `0d68551`) |

The candidate correction is mode/content only: directly invoked private-staging
helpers that were committed `100644` are now `100755`, direct child-shell
invocations use `bash`, and `PROXY_BINDING_PROFILE` is forwarded explicitly.
No application behavior changed. Both original worktrees and all historical
evidence remain untouched.

## Root cause of the last failure

Run `44977330367` failed in `verify-linux-ownership.sh` at
`builder_build_docker` after about half a second. The pinned `docker:27-dind`
service was still starting; its container was running, but the published
`tcp://127.0.0.1:2375` API was not ready. The old loop treated a zero exit
status as success and broke immediately. On this Docker CLI, `docker info` can
exit `0` with **empty stdout** while printing `Cannot connect to the Docker
daemon ... Is the docker daemon running?` to stderr, so the loop never waited.
This is reproduced deliberately in debug run `44979807275` against a closed
port: five attempts, exit status `0`, empty stdout, `empty_response`.

The pinned `27.5.1-dind` entrypoint has no extra sleep; in non-TLS mode it
starts `dockerd` with `--host=tcp://0.0.0.0:2375`. Container liveness/health
does not prove the published TCP API is ready. Readiness observes in debug
runs were 9.5–13.2 seconds after job start.

## Repairs

- Added `probe-docker-endpoint.sh`: builder-identity probe of the exact
  endpoint, per-probe `timeout` and overall deadline, attempt/T SV retention,
  daemon ID and server version, `transient_startup` / `access_or_config` /
  `empty_response` classification, and bounded host listener/container/log
  diagnostics on failure. Non-loopback TCP endpoints are rejected.
- Moved Docker capability checks after all ownership/profile fixtures in
  `verify-linux-ownership.sh`; DinD unavailability can no longer skip them.
- Added independent workflow steps for the build probe, host probe, ownership
  preflight and ownership regression, followed by a gate before installation.
- Retained archives, receipts and identity files in export staging even when
  qualification fails after the checkpoint.
- Added verified origin/listener closure to cleanup (`origin_unreachable`,
  `http_listener_absent`, `https_listener_absent`).
- Priority diagnostics are retained as bounded tails instead of being dropped.
- Added executable-mode verification for the exact candidate and bundle.
- Added a manual/path-triggered 10-minute debug workflow and Linux probe
  regression.

## Bounded debug evidence

| Run | Commit | Result | Notes |
| --- | --- | --- | --- |
| `44979679822` | `5bcfe93` | failed | probe/preflight passed; debug control-root traversal and fixture escaping defects found |
| `44979807275` | `b4df72c` | passed | build ready 6 attempts/13.2s; host 1/0.1s; distinct daemons; all 27 harness tests passed |
| `44979954736` | `bf6dc86` | passed | exact candidate identity/modes/ancestry verified |
| `44980069092` | `b83a11a` | passed | exact `actions/checkout` of `863a8a7` verified |

Debug run `44979807275` recorded:

```text
builder_host_docker_id=fb20f451-b428-4d99-946c-e0f8dfac42c1
builder_build_docker_id=a6b9038d-f209-453b-8245-185b6b7c1601
distinct_docker_daemons=true
loopback_profile=valid
wildcard_profile=valid
mixed_profiles_rejected=true
```

The builder was `packer` (UID 1000), the runner `runner` (UID 1001). Private
roots stayed `0700/0600`, the export staging `2770`, and exported files
`0640`.

## Remaining authorized action

Create this branch once at a request-only commit. The workflow
`builder-exact-rehearsal-0d68551-readiness.yml` then runs one 90-minute Linux
execution and one 15-minute fresh-runner retrieval. No second full attempt is
authorized. Public hosting and customer admission remain out of scope.
