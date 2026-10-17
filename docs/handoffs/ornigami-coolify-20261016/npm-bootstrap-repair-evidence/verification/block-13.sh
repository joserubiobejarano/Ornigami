set -Eeuo pipefail
export TRIVY_CACHE_DIR="$RUNNER_TEMP/trivy-cache"
image="ornigami:rehearsal-${SOURCE_SHA}"
image_id=$(docker image inspect "$image" --format '{{.Id}}')
image_size=$(docker image inspect "$image" --format '{{.Size}}')
rootfs_layers=$(docker image inspect "$image" --format '{{json .RootFS.Layers}}')
rootfs_layers_sha256=$(printf '%s' "$rootfs_layers" | sha256sum | cut -d' ' -f1)
docker save --output "$RUNNER_TEMP/ornigami-image.tar" "$image"
archive_sha256=$(sha256sum "$RUNNER_TEMP/ornigami-image.tar" | cut -d' ' -f1)
archive_bytes=$(stat -c %s "$RUNNER_TEMP/ornigami-image.tar")
{
  printf '\n### Final image archive identity\n\n'
  printf '%s\n' "- Docker image ID: \`$image_id\`"
  printf '%s\n' "- Docker image bytes: $image_size"
  printf '%s\n' "- Root filesystem layer IDs: \`$rootfs_layers\`"
  printf '%s\n' "- Root filesystem layer-list SHA-256: \`$rootfs_layers_sha256\`"
  printf '%s\n' "- Saved archive SHA-256: \`$archive_sha256\`"
  printf '%s\n' "- Saved archive bytes: $archive_bytes"
  printf '%s\n' '- Trivy report ImageID must match the local Docker image ID above'
} >> "$ORNIGAMI_JOB_SUMMARY"
export INITIAL_BUILD_OUTCOME=success
node "$RUNNER_TEMP/source/scripts/framework-prototype/serial-scan-driver.mjs" final
python3 - "$RUNNER_TEMP/trivy.json" "$ORNIGAMI_JOB_SUMMARY" "$image_id" <<'PY'
import collections, json, pathlib, sys
report = json.loads(pathlib.Path(sys.argv[1]).read_text())
expected_image_id = sys.argv[3]
if not isinstance(report, dict) or type(report.get("SchemaVersion")) is not int or report["SchemaVersion"] != 2:
    raise SystemExit("Trivy report SchemaVersion is missing or unsupported; refusing to accept the scan")
if report.get("ArtifactType") != "container_image":
    raise SystemExit("Trivy report ArtifactType is not container_image; refusing to accept the scan")
metadata = report.get("Metadata")
if not isinstance(metadata, dict) or metadata.get("ImageID") != expected_image_id:
    raise SystemExit("Trivy report Metadata.ImageID does not match the built image; refusing to accept the scan")
results = report.get("Results")
if not isinstance(results, list) or not results:
    raise SystemExit("Trivy returned missing or empty Results; refusing to accept the scan")
counts = collections.Counter()
findings = []
seen_classes = set()
expected_types = {"os-pkgs": {"debian"}, "lang-pkgs": {"npm", "node-pkg"}}
seen_node_type = False
for result in results:
    if not isinstance(result, dict) or not isinstance(result.get("Target"), str) or not result["Target"]:
        raise SystemExit("Trivy returned a malformed result entry; refusing to accept the scan")
    result_class = result.get("Class")
    result_type = result.get("Type")
    if not isinstance(result_class, str) or not isinstance(result_type, str) or result_class not in expected_types or result_type not in expected_types[result_class]:
        raise SystemExit("Trivy returned an unrecognized result class/type; refusing to accept the scan")
    seen_classes.add(result_class)
    if result_class == "lang-pkgs":
        seen_node_type = True
    vulnerabilities = result.get("Vulnerabilities")
    if vulnerabilities is None:
        continue
    if not isinstance(vulnerabilities, list):
        raise SystemExit("Trivy returned malformed Vulnerabilities; expected absent, null, or a list")
    for item in vulnerabilities:
        if not isinstance(item, dict) or any(not isinstance(item.get(key), str) or not item[key].strip() for key in ("Severity", "VulnerabilityID", "PkgName")):
            raise SystemExit("Trivy returned a malformed vulnerability entry; refusing to accept the scan")
        severity = item["Severity"].upper()
        counts[severity] += 1
        findings.append((severity, item["PkgName"], item.get("InstalledVersion", ""), item.get("FixedVersion", ""), item["VulnerabilityID"], item.get("PrimaryURL", "")))
if seen_classes != set(expected_types) or not seen_node_type:
    raise SystemExit("Trivy report lacks OS or Node.js package inventory coverage; refusing to accept the scan")
if any(level not in {"CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"} for level, *_ in findings):
    raise SystemExit("Trivy returned an unknown severity; refusing to accept the scan")
with open(sys.argv[2], "a", encoding="utf-8") as out:
    out.write("\n### Trivy 0.76.0 image scan\n\n")
    out.write("| Severity | Findings |\n| --- | ---: |\n")
    for level in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"):
        out.write(f"| {level} | {counts[level]} |\n")
    out.write("\nNo image was pushed or published by this workflow.\n")
    if findings:
        out.write("\n| Severity | Package | Installed | Fixed | Advisory | Primary URL |\n| --- | --- | --- | --- | --- | --- |\n")
        safe = lambda value: str(value).replace("\\", "\\\\").replace("|", "\\|").replace("`", "\\`").replace("<", "&lt;").replace(">", "&gt;").replace("\n", " ")
        for severity, package, installed, fixed, advisory, url in sorted(findings):
            out.write(f"| {safe(severity)} | {safe(package)} | {safe(installed)} | {safe(fixed)} | {safe(advisory)} | {safe(url)} |\n")
if counts["CRITICAL"] or counts["HIGH"]:
    raise SystemExit("Trivy found HIGH or CRITICAL vulnerabilities; scan recorded and build validation failed")
PY

