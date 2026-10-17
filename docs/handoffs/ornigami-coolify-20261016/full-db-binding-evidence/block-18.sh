set -Eeuo pipefail
ORNIGAMI_JOB_SUMMARY=${ORNIGAMI_JOB_SUMMARY:-"$RUNNER_TEMP/ornigami-job-summary.md"}
ORNIGAMI_EVIDENCE_DIR=${ORNIGAMI_EVIDENCE_DIR:-"$RUNNER_TEMP/ornigami-evidence"}
mkdir -p "$ORNIGAMI_EVIDENCE_DIR/scans" "$ORNIGAMI_EVIDENCE_DIR/runner" "$ORNIGAMI_EVIDENCE_DIR/runtime" "$ORNIGAMI_EVIDENCE_DIR/build" "$ORNIGAMI_EVIDENCE_DIR/browser"
printf 'builder_name=%s\nbuilder_container_id=%s\nbuilder_state_volume=%s\nimage_tag=%s\nimage_id=%s\n' \
  "$OWNED_BUILDER_NAME" "$OWNED_BUILDER_CONTAINER_ID" "$OWNED_BUILDER_STATE_VOLUME" "$OWNED_IMAGE_TAG" "$OWNED_IMAGE_ID" \
  > "$ORNIGAMI_EVIDENCE_DIR/runner/owned-resources.txt"
printf 'workflow_outcome=%s\nworkflow_exit_code=%s\n' "$IMAGE_BUILD_OUTCOME" "$IMAGE_BUILD_EXIT_CODE" > "$ORNIGAMI_EVIDENCE_DIR/build/workflow-status.txt"
runtime_evidence_missing=0
for file in base-trivy.json trivy.json; do
  [[ -f "$RUNNER_TEMP/$file" ]] && cp -- "$RUNNER_TEMP/$file" "$ORNIGAMI_EVIDENCE_DIR/scans/$file"
done
for file in builder-before-build.txt builder-after-build.txt builder-final.txt; do
  [[ -f "$RUNNER_TEMP/$file" ]] && cp -- "$RUNNER_TEMP/$file" "$ORNIGAMI_EVIDENCE_DIR/runner/$file"
done
if [[ -n "$OWNED_BUILDER_CONTAINER_ID" ]]; then
  current_builder_id=$(docker inspect "$OWNED_BUILDER_CONTAINER_ID" --format '{{.Id}}' 2>/dev/null || true)
  current_builder_name=$(docker inspect "$OWNED_BUILDER_CONTAINER_ID" --format '{{.Name}}' 2>/dev/null || true)
  if [[ "$current_builder_id" == "$OWNED_BUILDER_CONTAINER_ID" && "$current_builder_name" == "/buildx_buildkit_${OWNED_BUILDER_NAME}0" ]]; then
    if docker exec "$OWNED_BUILDER_CONTAINER_ID" sh -c 'for path in memory.max memory.swap.max memory.peak memory.events cpu.max cpu.stat; do printf "==%s==\\n" "$path"; cat "/sys/fs/cgroup/$path"; done' > "$ORNIGAMI_EVIDENCE_DIR/runner/builder-before-cleanup.txt" 2>&1; then
      printf '%s\n' 'status=collected' >> "$ORNIGAMI_EVIDENCE_DIR/runner/builder-before-cleanup-status.txt"
    else
      printf '%s\n' 'status=unavailable' > "$ORNIGAMI_EVIDENCE_DIR/runner/builder-before-cleanup-status.txt"
    fi
  else
    printf '%s\n' 'status=owned-builder-container-not-present' > "$ORNIGAMI_EVIDENCE_DIR/runner/builder-before-cleanup-status.txt"
  fi
else
  printf '%s\n' 'status=builder-not-created-or-id-unavailable' > "$ORNIGAMI_EVIDENCE_DIR/runner/builder-before-cleanup-status.txt"
fi
[[ -f "$RUNNER_TEMP/runtime-acceptance.log" ]] && cp -- "$RUNNER_TEMP/runtime-acceptance.log" "$ORNIGAMI_EVIDENCE_DIR/runtime/runtime-acceptance.log"
if [[ "$RUNTIME_OUTCOME" != skipped ]]; then
  if [[ ! -s "$ORNIGAMI_EVIDENCE_DIR/runtime/runtime-http.json" ]]; then
    printf 'status=missing\nruntime_step_outcome=%s\nexit_code=%s\n' "$RUNTIME_OUTCOME" "$RUNTIME_EXIT_CODE" > "$ORNIGAMI_EVIDENCE_DIR/runtime/runtime-evidence-status.txt"
    runtime_evidence_missing=1
  else
    printf 'status=collected\nruntime_step_outcome=%s\nexit_code=%s\n' "$RUNTIME_OUTCOME" "$RUNTIME_EXIT_CODE" > "$ORNIGAMI_EVIDENCE_DIR/runtime/runtime-evidence-status.txt"
  fi
else
  printf 'status=not-run\nruntime_step_outcome=skipped\n' > "$ORNIGAMI_EVIDENCE_DIR/runtime/runtime-evidence-status.txt"
fi
# Require all independently measured phases after success. A failed/early
# runtime keeps available snapshots and exact failure diagnostics; later
# phases are explicitly unavailable, never fabricated or called passed.
{
  printf 'runtime_step_outcome=%s\n' "$RUNTIME_OUTCOME"
  for phase_file in runtime-first-cgroup.txt runtime-after-restart-cgroup.txt runtime-after-recreate-cgroup.txt native-image-formats.json; do
    if [[ -s "$ORNIGAMI_EVIDENCE_DIR/runtime/$phase_file" ]]; then
      printf '%s=collected\n' "$phase_file"
    else
      printf '%s=unavailable\n' "$phase_file"
      if [[ "$RUNTIME_OUTCOME" == success ]]; then runtime_evidence_missing=1; fi
    fi
  done
  if [[ "$RUNTIME_OUTCOME" == failure ]]; then
    for failure_file in failure.json failure-evidence.txt; do
      if [[ ! -s "$ORNIGAMI_EVIDENCE_DIR/runtime/$failure_file" ]]; then
        printf '%s=missing-required-failure-diagnostic\n' "$failure_file"
        runtime_evidence_missing=1
      fi
    done
  fi
} > "$ORNIGAMI_EVIDENCE_DIR/runtime/snapshot-status.txt"
printf 'workflow_outcome=%s\nworkflow_exit_code=%s\n' "${FRAMEWORK_BROWSER_OUTCOME:-unknown}" "${FRAMEWORK_BROWSER_EXIT_CODE:-}" > "$ORNIGAMI_EVIDENCE_DIR/browser/workflow-status.txt"
if [[ -x "$RUNNER_TEMP/trivy" ]]; then
  "$RUNNER_TEMP/trivy" --version > "$ORNIGAMI_EVIDENCE_DIR/scans/trivy-version.txt" 2>&1 || printf '%s\n' 'Trivy version metadata unavailable.' > "$ORNIGAMI_EVIDENCE_DIR/scans/trivy-version.txt"
else
  printf '%s\n' 'Trivy was unavailable before artifact capture.' > "$ORNIGAMI_EVIDENCE_DIR/scans/trivy-version.txt"
fi
{
  printf '== runner disk before cleanup ==\n'
  if ! df -PB1 "$RUNNER_TEMP"; then printf '%s\n' 'disk usage unavailable'; fi
  printf '\n== Docker storage before cleanup ==\n'
  if ! timeout 15s docker system df; then printf '%s\n' 'Docker storage report unavailable or timed out'; fi
  printf '\n== selected runner-temp path sizes (image archive size only; archive content is excluded) ==\n'
  for path in "$RUNNER_TEMP/source" "$RUNNER_TEMP/ornigami-image.tar" "$RUNNER_TEMP/trivy-cache" "$RUNNER_TEMP/trivy.db" "$RUNNER_TEMP/java-db"; do
    [[ -e "$path" ]] || continue
    if ! timeout 15s du -sb "$path"; then printf 'size unavailable: %s\n' "$(basename "$path")"; fi
  done
} > "$ORNIGAMI_EVIDENCE_DIR/runner/pre-cleanup-usage.txt" 2>&1
summary_evidence_missing=0
if [[ -s "$ORNIGAMI_JOB_SUMMARY" ]]; then
  cp -- "$ORNIGAMI_JOB_SUMMARY" "$ORNIGAMI_EVIDENCE_DIR/step-summary.md"
  printf 'status=collected\nsource=persistent-job-summary\n' > "$ORNIGAMI_EVIDENCE_DIR/summary-status.txt"
else
  summary_evidence_missing=1
  printf '# Incomplete evidence capture\n\nPersistent pre-upload job summary was missing or empty. Runtime outcome: %s; build outcome: %s. Capture failed; this fallback is not recovered phase evidence.\n' "$RUNTIME_OUTCOME" "$IMAGE_BUILD_OUTCOME" > "$ORNIGAMI_EVIDENCE_DIR/step-summary.md"
  printf 'status=missing-or-empty\nfallback=diagnostic-only\n' > "$ORNIGAMI_EVIDENCE_DIR/summary-status.txt"
fi
[[ -s "$ORNIGAMI_EVIDENCE_DIR/step-summary.md" ]]
cat "$ORNIGAMI_EVIDENCE_DIR/step-summary.md" >> "$GITHUB_STEP_SUMMARY"
export CAPTURE_COMPLETENESS=passed
if [[ "$runtime_evidence_missing" -eq 1 || "$summary_evidence_missing" -eq 1 ]]; then export CAPTURE_COMPLETENESS=failed; fi
python3 - "$ORNIGAMI_EVIDENCE_DIR" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_SHA" "$GITHUB_REF" "$GITHUB_EVENT_NAME" "${SOURCE_SHA:-}" "${EXPECTED_LOCK_SHA256:-}" "$ADMISSION_OUTCOME" "$RUNNER_PREFLIGHT_OUTCOME" "$BASE_SCAN_OUTCOME" "$IMAGE_BUILD_OUTCOME" "$IMAGE_BUILD_EXIT_CODE" "$RUNTIME_OUTCOME" "$RUNTIME_EXIT_CODE" "$FINAL_SCAN_OUTCOME" "$RESOURCE_OUTCOME" "$BASE_GATE_OUTCOME" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
names = ("run_id", "run_attempt", "request_sha", "ref", "event", "source_sha", "expected_lock_sha256", "admission_outcome", "runner_preflight_outcome", "base_scan_outcome", "image_build_outcome", "image_build_exit_code", "runtime_outcome", "runtime_exit_code", "final_scan_outcome", "resource_outcome", "base_gate_outcome")
metadata = dict(zip(names, sys.argv[2:]))
metadata["framework_browser_outcome"] = __import__("os").environ.get("FRAMEWORK_BROWSER_OUTCOME", "unknown")
metadata["framework_browser_exit_code"] = __import__("os").environ.get("FRAMEWORK_BROWSER_EXIT_CODE", "")
metadata["runtime_evidence_status"] = (root / "runtime/runtime-evidence-status.txt").read_text(encoding="utf-8").splitlines()[0].split("=", 1)[1]
metadata["summary_evidence_status"] = (root / "summary-status.txt").read_text(encoding="utf-8").splitlines()[0].split("=", 1)[1]
metadata["runtime_snapshot_status"] = (root / "runtime/snapshot-status.txt").read_text(encoding="utf-8").splitlines()
metadata["capture_completeness_status"] = __import__("os").environ["CAPTURE_COMPLETENESS"]
metadata["custody_status"] = "not-assessed-by-capture"
metadata["all_stage_gate_outcome"] = __import__("os").environ.get("ALL_STAGE_OUTCOME", "unknown")
metadata["database_admission_outcome"] = __import__("os").environ.get("DATABASE_ADMISSION_OUTCOME", "unknown")
stages = root / "stage-scans/index.json"
expected=["original-base","original-runtime-base","build-base","deps","builder","prod-deps","runner","buildkit","dockerfile-frontend"]
stages.parent.mkdir(parents=True,exist_ok=True)
stage_capture = "passed"
try:
    if not stages.exists():
        if metadata["all_stage_gate_outcome"] not in ("unknown", "skipped", ""):
            raise ValueError("attempted scan pipeline has no index")
        data={"schema":1,"sourceSha":metadata["source_sha"],"result":"failed","expectedStages":expected,"stages":[{"stage":s,"result":"skipped","reason":"pipeline unavailable before capture"} for s in expected]}
    else:
        data=json.loads(stages.read_text())
        if data.get("sourceSha") != metadata["source_sha"] or data.get("expectedStages") != expected or sorted(x["stage"] for x in data["stages"]) != sorted(expected) or data.get("result") not in ("passed", "failed"):
            raise ValueError("scan index identity or nine-stage coverage mismatch")
        for stage in data["stages"]:
            if stage.get("collectionComplete"):
                required=["filesystem/result.json","filesystem-resources.json","vulnerabilities-resources.json","scan/index.json","scan/"+stage["stage"]+"/trivy.json"]
                if any(not (stages.parent/stage["stage"]/p).is_file() or (stages.parent/stage["stage"]/p).stat().st_size == 0 for p in required):
                    raise ValueError("claimed complete stage lacks required receipts: "+stage["stage"])
except (ValueError, KeyError, TypeError, AttributeError, OSError) as error:
    stage_capture="failed"
    if stages.exists():
        (stages.parent/"invalid-index-preserved.txt").write_bytes(stages.read_bytes())
    data={"schema":1,"sourceSha":metadata["source_sha"],"result":"failed","expectedStages":expected,"captureError":str(error),"stages":[{"stage":s,"result":"unverified","reason":"invalid or incomplete scan evidence"} for s in expected]}
    metadata["capture_completeness_status"]="failed"
stages.write_text(json.dumps(data,indent=2)+"\n")
(stages.parent/"completeness-status.txt").write_text(stage_capture+"\n")
if metadata["database_admission_outcome"] in ("success", "failure"):
    try:
        dbdir=stages.parent/"database-admission"
        publication=json.loads((stages.parent/"db-publication.json").read_text())
        expected_digest="sha256:10584ede500597f516f0d5f4ab750c125999dc0359995a4494ab6cb12e700730"
        if publication["sourceSha"] != metadata["source_sha"] or publication["manifestDigest"] != expected_digest or publication["repository"] != "ghcr.io/aquasecurity/trivy-db@"+expected_digest:
            raise ValueError("official DB publication source/digest mismatch")
        download=json.loads((stages.parent/"database-resources.json").read_text())
        args=download["arguments"]
        if args.count("--db-repository") != 1 or args[args.index("--db-repository")+1] != publication["repository"] or args.count("--download-db-only") != 1:
            raise ValueError("official DB download invocation mismatch")
        for name in ("index.json","clock.json","validation-clock.json","metadata-identity.json","databaseIdentity.json","scannerIdentity.json"):
            if not (dbdir/name).is_file() or not (dbdir/name).stat().st_size:
                raise ValueError("missing shared DB admission receipt: "+name)
        db=json.loads((dbdir/"index.json").read_text())
        if db.get("phase") != "complete" or db["sourceSha"] != metadata["source_sha"] or db["result"] != ("passed" if metadata["database_admission_outcome"] == "success" else "failed"):
            raise ValueError("shared DB admission source/result mismatch")
        if db.get("metadataIdentity") and not (dbdir/"metadata.original.bin").is_file():
            raise ValueError("original bounded metadata missing")
        if db.get("metadataIdentity"):
            original=(dbdir/"metadata.original.bin").read_bytes()
            identity=db["metadataIdentity"]
            digest=hashlib.sha256(original).hexdigest()
            if len(original)>65536 or len(original)!=identity["retainedBytes"] or digest!=identity["retainedSha256"] or (not identity["truncated"] and (identity["sha256"]!=digest or identity["bytes"]!=len(original))):
                raise ValueError("original metadata content/identity mismatch")
        metadata["database_diagnostics_status"]="collected"
    except (OSError, ValueError, KeyError, TypeError, AttributeError, IndexError) as error:
        metadata["database_diagnostics_status"]="failed: "+str(error)
        metadata["capture_completeness_status"]="failed"
        (stages.parent/"completeness-status.txt").write_text("failed\n")
else:
    metadata["database_diagnostics_status"]="not-run"
metadata["all_stage_evidence_status"] = data["result"]
files = []
for path in sorted(p for p in root.rglob("*") if p.is_file() and p.name != "manifest.json"):
    files.append({"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(root / "manifest.json").write_text(json.dumps({"schema": 1, **metadata, "files": files}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
if [[ "$(cat "$ORNIGAMI_EVIDENCE_DIR/stage-scans/completeness-status.txt")" != passed ]]; then exit 1; fi
if [[ "$runtime_evidence_missing" -eq 1 || "$summary_evidence_missing" -eq 1 ]]; then
  printf '%s\n' 'Required runtime receipts, successful phase snapshots or persistent summary were missing; evidence collection failed. Manifest retained; custody is independent.' >&2
  exit 1
fi

