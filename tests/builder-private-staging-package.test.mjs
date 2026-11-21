import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (name) => readFileSync(path.join(root, "deploy", "builder", "private-staging", name), "utf8");

test("private staging compose keeps the app single-replica, read-only and off the edge network", () => {
  const compose = read("compose.private-staging.reference.yml");
  assert.match(compose, /read_only: true/);
  assert.match(compose, /user: "1000:1000"/);
  assert.match(compose, /builder-store:\/data\/builder/);
  assert.match(compose, /builder_internal:\s*\n\s*internal: true/);
  assert.match(compose, /tmpfs:/);
  assert.match(compose, /org\.ornigami\.staging: "true"/);
  assert.match(compose, /BUILDER_RUNTIME_ALLOW_TEST_HOOKS: "0"/);
  assert.match(compose, /BUILDER_RUNTIME_TEST_PROVIDER: none/);
  assert.doesNotMatch(compose, /DATABASE_URL|OPENAI_API_KEY|STRIPE_SECRET_KEY|RESEND_API_KEY|SENTRY_DSN/);
  const appBlock = compose.slice(compose.indexOf("  app:"), compose.indexOf("  proxy:"));
  assert.doesNotMatch(appBlock, /ports:/);
});

test("private staging Caddy reference terminates TLS, enforces BasicAuth and preserves origin headers", () => {
  const caddy = read("Caddyfile.example");
  assert.match(caddy, /basic_auth \{/);
  assert.match(caddy, /reverse_proxy app:3000/);
  assert.match(caddy, /X-Forwarded-Proto \{scheme\}/);
  assert.match(caddy, /header_up Host \{host\}/);
  assert.match(caddy, /Strict-Transport-Security/);
  assert.doesNotMatch(caddy, /auth_users\s*[^\s]/);
});

test("staging acceptance distinguishes source, image digest, platform, origin and Actions evidence", () => {
  const readme = read("README.md");
  assert.match(readme, /4e3e00af212a3d97de582ab6fca6ecca8d0665dd/);
  assert.match(readme, /https:\/\/builder-staging\.ornigami\.com/);
  assert.match(readme, /immutable `repo@sha256:<digest>`/);
  assert.match(readme, /Actions artifact digest is \*\*evidence transport identity\*\*, not an image/);
  assert.match(readme, /full_acceptance=false/);
  assert.match(readme, /Existing-image qualification/);
  assert.match(readme, /never rebuilds, retags a substitute or falls back to\s+a build/);
  assert.match(readme, /QUALIFICATION_PATH=https-edge/);
  assert.match(readme, /QUALIFICATION_PATH=http-loopback/);
  assert.match(readme, /effectiveRuntimeOrigin/);
  assert.match(readme, /REQUIRE_FRESH_DAEMON=0/);
  assert.match(readme, /Neither the local image ID nor an archive checksum proves bit-for-bit\s+reproducibility from source/);
  for (const file of [
    "accept-edge.mjs",
    "accept-browser.sh",
    "accept-runtime.sh",
    "accept-runtime-rollback.sh",
    "build-and-retain.sh",
    "verify-retained-image.sh",
    "qualify-existing-image.sh",
    "rehearse-exact-candidate.sh",
    "verify-image-archive.mjs",
    "image-identity.mjs",
    "proxy-bindings.mjs",
    "sri-script-audit.mjs",
  ]) {
    assert.ok(existsSync(path.join(root, "deploy", "builder", "private-staging", file)), file);
  }
});

test("staging contract keeps Actions evidence separate from image identity", () => {
  const contract = JSON.parse(read("staging-contract.example.json"));
  assert.equal(contract.sourceSha, "4e3e00af212a3d97de582ab6fca6ecca8d0665dd");
  assert.equal(contract.origin.https, "https://builder-staging.ornigami.com");
  assert.notEqual(contract.image.testedLoopbackLocalId, contract.actionsEvidence.digest);
  assert.match(contract.actionsEvidence.identityType, /not an image digest/);
  assert.equal(contract.volume.replicas, 1);
  assert.equal(contract.volume.writers, 1);
  assert.equal(contract.egress.appNetwork, "internal-only");
});

test("synthetic Linux journey exercises minimisation, restored denial, journal replay and a second restore", () => {
  const qualify = readFileSync(path.join(root, "deploy", "builder", "qualify-linux.sh"), "utf8");
  const replay = qualify.indexOf("replay-minimization");
  const secondRestore = qualify.indexOf('note "Prepare and replay the second restore cycle"');
  assert.ok(qualify.indexOf("minimize-apply") >= 0, "minimisation apply is missing");
  assert.ok(qualify.indexOf("restore-prepare") >= 0, "restore prepare is missing");
  assert.ok(replay >= 0, "journal replay is missing");
  assert.ok(secondRestore > replay, "second restore must follow first replay");
  assert.ok(qualify.indexOf("RESTORE2_VOLUME") >= 0, "second restore volume is missing");
  assert.ok(qualify.indexOf("restore:access-denied") >= 0, "restored access denial is missing");
  assert.ok(qualify.indexOf("second-restore:receipt-a-preserved") >= 0, "receipt history check is missing");
  for (const expected of [
    "restore_gate_blocked_reopen=true",
    "restore_replay_completed=true",
    "restored_access_denied=true",
    "second_restore_cycle=true",
    "second_restore_receipt_history_preserved=true",
    "same_id_changed_intent_replay_blocked=true",
    "changed_intent_gate_preserved=true",
    "control_subject_access=true",
  ]) {
    assert.ok(qualify.includes(expected), expected);
  }
  assert.ok(qualify.indexOf("changed-intent") >= 0, "changed-intent negative replay is missing");
});

test("exact-candidate rehearsal builds once, verifies the archive independently and reuses one image ID", () => {
  const rehearsal = read("rehearse-exact-candidate.sh");
  assert.match(rehearsal, /build-and-retain\.sh/);
  assert.match(rehearsal, /verify-image-archive\.mjs/);
  assert.match(rehearsal, /qualify-existing-image\.sh/);
  assert.match(rehearsal, /BUILD_CONTEXT" != "\$VERIFY_CONTEXT/);
  assert.match(rehearsal, /IMAGE_REFERENCE="\$checkpoint_image"/);
  assert.match(rehearsal, /PLAN_ONLY="\$\{PLAN_ONLY:-1\}"/);
  assert.match(rehearsal, /REHEARSAL_MODE="\$\{REHEARSAL_MODE:-\}"/);
  assert.match(rehearsal, /state": "edge-setup"/);
  assert.match(rehearsal, /RUNNER_AUTHORIZED/);
  assert.match(rehearsal, /DAEMON_AUTHORIZED/);
  assert.match(rehearsal, /EDGE_AUTHORIZED/);
  assert.match(rehearsal, /ARTIFACT_CUSTODY_AUTHORIZED/);
  assert.match(rehearsal, /"customerAdmission": "closed"/);
  assert.doesNotMatch(rehearsal, /docker\s+push|registry.*push/i);
});

test("browser acceptance supports actual HTTPS origin, private access and dynamic SRI", () => {
  const browser = readFileSync(path.join(root, "deploy", "builder", "qualify-browser.mjs"), "utf8");
  assert.match(browser, /BROWSER_ALLOW_REMOTE_ORIGIN/);
  assert.match(browser, /BROWSER_BASIC_AUTH_USER/);
  assert.match(browser, /httpCredentials/);
  assert.match(browser, /sri:\$\{label\}/);
  assert.match(browser, /csp:header/);
  assert.match(browser, /scriptRecords/);
  assert.match(browser, /inserted/);
  assert.match(browser, /removed/);
  assert.match(browser, /BROWSER_IMAGE_ID/);
  assert.match(browser, /BROWSER_QUALIFICATION_PATH/);
  assert.match(browser, /BROWSER_APPLICATION_ORIGIN/);
});

test("edge and runtime acceptance record the image identity and parse proxy bindings structurally", () => {
  const edge = readFileSync(
    path.join(root, "deploy", "builder", "private-staging", "accept-edge.mjs"),
    "utf8",
  );
  assert.match(edge, /EXPECTED_IMAGE_ID/);
  assert.match(edge, /EXPECTED_SOURCE_SHA/);
  assert.match(edge, /HARNESS_SHA/);
  assert.match(edge, /edge-sri-scripts\.json/);
  assert.match(edge, /scriptRecords/);

  const runtime = readFileSync(
    path.join(root, "deploy", "builder", "private-staging", "accept-runtime.sh"),
    "utf8",
  );
  assert.match(runtime, /EXPECTED_IMAGE_ID/);
  assert.match(runtime, /proxy-bindings\.mjs/);
  assert.doesNotMatch(runtime, /PROXY_PORTS" != \*'"3000\/tcp"'/);
});
