import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowPath = ".github/workflows/builder-retained-image-qualification.yml";
const requestPath = ".github/build-requests/builder-retained-image-qualification.json";
const wrapperPath = "deploy/builder/private-staging/run-retained-image-qualification-linux.sh";

const workflow = readFileSync(workflowPath, "utf8");
const request = JSON.parse(readFileSync(requestPath, "utf8"));
const wrapper = readFileSync(wrapperPath, "utf8");

test("retained-image workflow is one initial branch publication with fixed budgets", () => {
  assert.match(workflow, /ci\/retained-image-qualification-20261122/);
  assert.match(workflow, /\.github\/build-requests\/builder-retained-image-qualification\.json/);
  assert.match(workflow, /github\.event\.created == true/);
  assert.match(workflow, /github\.event\.before == '0{40}'/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /timeout-minutes: 90/);
  assert.equal(request.dispatches, 1);
  assert.equal(request.attempts, 1);
  assert.equal(request.qualificationTimeoutMinutes, 90);
  assert.equal(request.retrievalTimeoutMinutes, 15);
});

test("retained-image qualification never builds and uses host Docker only", () => {
  assert.doesNotMatch(workflow, /docker:27-dind|DOCKER_TLS_CERTDIR|2375/);
  assert.doesNotMatch(wrapper, /docker build|build-and-retain\.sh/);
  assert.match(wrapper, /docker load -i "\$ARCHIVE_PATH"/);
  assert.match(wrapper, /PRODUCER_HARNESS_SHA/);
  assert.match(wrapper, /consumerHarnessSha/);
  assert.match(wrapper, /archiveSha256/);
  assert.match(wrapper, /archiveBytes/);
});

test("archive retrieval is independent of qualification success", () => {
  assert.match(workflow, /needs: qualify\s*\n\s*if: always\(\)/);
  assert.equal((workflow.match(/gh run download 45030190736/g) ?? []).length, 2);
  assert.match(workflow, /REQUIRE_FRESH_DAEMON=1/);
  assert.match(workflow, /verify-image-archive\.mjs/);
  assert.match(workflow, /qualificationStatus/);
  assert.match(workflow, /r\.status !== "complete"/);
});

test("retained evidence roots exist before the first write", () => {
  const mkdir = wrapper.indexOf('"$EVIDENCE_ROOT/edge"');
  const firstEdgeWrite = wrapper.indexOf("caddy-digests.json");
  assert.ok(mkdir > 0, "wrapper must create the edge evidence directory");
  assert.ok(firstEdgeWrite > mkdir, "edge evidence directory must be created before use");
  assert.doesNotMatch(workflow, /^ {12,}NODE$/m);
});

test("browser mode is explicit before the retained journey", () => {
  assert.match(workflow, /Require browser smoke before qualification/);
  assert.match(workflow, /r\.sandbox !== "no-sandbox"/);
  assert.match(wrapper, /BROWSER_CHROMIUM_SANDBOX/);
  assert.match(wrapper, /BROWSER_MODE="no-sandbox"/);
  assert.equal(request.browserSandbox, "explicit synthetic-CI exception; default no-sandbox");
  assert.equal(request.customerAdmission, "closed");
});
