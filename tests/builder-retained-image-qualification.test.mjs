import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowPath = ".github/workflows/builder-retained-image-qualification.yml";
const requestPath = ".github/build-requests/builder-retained-image-qualification-r3.json";
const wrapperPath = "deploy/builder/private-staging/run-retained-image-qualification-linux.sh";

const workflow = readFileSync(workflowPath, "utf8");
const request = JSON.parse(readFileSync(requestPath, "utf8"));
const wrapper = readFileSync(wrapperPath, "utf8");

test("retained-image workflow is one initial branch publication with fixed budgets", () => {
  assert.match(workflow, /ci\/retained-image-qualification-20261122-r3/);
  assert.match(workflow, /\.github\/build-requests\/builder-retained-image-qualification-r3\.json/);
  assert.match(workflow, /github\.event\.created == true/);
  assert.match(workflow, /github\.event\.before == '0{40}'/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /timeout-minutes: 90/);
  assert.equal(request.dispatches, 1);
  assert.equal(request.attempts, 1);
  assert.equal(request.qualificationTimeoutMinutes, 90);
  assert.equal(request.retrievalTimeoutMinutes, 15);
  assert.equal(request.consumerHarnessSha, "b1c6cce04f1fd5ad6ffdbdc3834bf28e8c1a2144");
  assert.equal(request.producerHarnessSha, "156259d0c4330b185a0844711b7004b0b4467887");
});

test("retained-image qualification never builds and uses host Docker only", () => {
  assert.doesNotMatch(workflow, /docker:27-dind|DOCKER_TLS_CERTDIR|2375/);
  assert.doesNotMatch(wrapper, /docker build|build-and-retain\.sh/);
  assert.match(wrapper, /docker load -i "\$ARCHIVE_PATH"/);
  assert.match(wrapper, /PRODUCER_HARNESS_SHA/);
  assert.match(wrapper, /--consumer-harness-sha/);
  assert.match(wrapper, /--archive-sha256/);
  assert.match(wrapper, /--archive-bytes/);
  assert.match(wrapper, /prepare_retained_evidence_root/);
  assert.match(wrapper, /export_retained_evidence/);
  assert.match(wrapper, /record_retained_host_identity/);
  assert.match(wrapper, /write-retained-custody-receipt\.mjs/);
});

test("archive retrieval is independent of qualification success", () => {
  assert.match(workflow, /needs: qualify\s*\n\s*if: always\(\)/);
  assert.equal((workflow.match(/gh run download 45030190736/g) ?? []).length, 2);
  assert.match(workflow, /REQUIRE_FRESH_DAEMON=1/);
  assert.match(workflow, /verify-image-archive\.mjs/);
  assert.match(workflow, /write-retrieval-receipt\.mjs/);
  assert.match(workflow, /--require-distinct-harness/);
  assert.match(
    readFileSync("deploy/builder/private-staging/write-retrieval-receipt.mjs", "utf8"),
    /archive-verified-qualification-incomplete/,
  );
});

test("retained evidence roots are prepared before the first write", () => {
  const prepare = wrapper.indexOf("prepare_retained_evidence_root");
  const firstEdgeWrite = wrapper.indexOf("caddy-digests.json");
  assert.ok(prepare > 0, "wrapper must prepare the evidence root");
  assert.ok(firstEdgeWrite > prepare, "evidence root must be prepared before use");
  assert.doesNotMatch(workflow, /^ {12,}NODE$/m);
});

test("browser mode is explicit before the retained journey", () => {
  assert.match(workflow, /BROWSER_CHROMIUM_SANDBOX: "0"/);
  assert.match(workflow, /Require browser smoke before qualification/);
  assert.match(workflow, /r\.browserMode !== "no-sandbox"/);
  assert.match(workflow, /BROWSER_CHROMIUM_SANDBOX="\$BROWSER_CHROMIUM_SANDBOX"/);
  assert.match(wrapper, /BROWSER_CHROMIUM_SANDBOX/);
  assert.match(wrapper, /BROWSER_MODE=no-sandbox/);
  assert.equal(request.browserSandbox, "explicit synthetic-CI exception; BROWSER_CHROMIUM_SANDBOX=0");
  assert.equal(request.customerAdmission, "closed");
});


