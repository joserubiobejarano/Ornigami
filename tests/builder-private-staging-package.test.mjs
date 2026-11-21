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
  assert.match(readme, /Neither the local image ID nor an archive checksum proves bit-for-bit\s+reproducibility from source/);
  for (const file of [
    "accept-edge.mjs",
    "accept-browser.sh",
    "accept-runtime.sh",
    "accept-runtime-rollback.sh",
    "build-and-retain.sh",
    "verify-retained-image.sh",
    "qualify-existing-image.sh",
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
