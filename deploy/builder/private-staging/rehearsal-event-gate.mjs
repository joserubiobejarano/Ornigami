#!/usr/bin/env node
/**
 * One unambiguous trigger gate for the exact-candidate rehearsal.
 *
 * The intended trigger is the initial creation of the dedicated remote branch,
 * with the request file already present in that same push. A later push to the
 * same branch is not a second trigger.
 */
import { existsSync, readFileSync } from "node:fs";

function fail(reason) {
  console.log(JSON.stringify({ ok: false, reason }, null, 2));
  process.exit(1);
}

const expectedRef = process.env.EXPECTED_REF;
const requestPath = process.env.REQUEST_PATH;
const expectedSource = process.env.EXPECTED_SOURCE_SHA;
const expectedHarness = process.env.EXPECTED_HARNESS_SHA;
const workflowSha = process.env.WORKFLOW_SHA;
const created = process.env.EVENT_CREATED;
const before = process.env.EVENT_BEFORE;
const ref = process.env.GITHUB_REF;
const attempt = process.env.GITHUB_RUN_ATTEMPT;

if (created !== "true") fail("push event is not the initial branch creation");
if (!/^0{40}$/.test(before ?? "")) fail("push event before-SHA is not the all-zero branch-creation SHA");
if (ref !== expectedRef) fail(`push ref ${ref ?? "<missing>"} is not ${expectedRef}`);
if (attempt !== "1") fail(`run attempt ${attempt ?? "<missing>"} is not 1`);
if (!/^[0-9a-f]{40}$/.test(workflowSha ?? "")) fail("workflow SHA is not a 40-hex commit");
if (!/^[0-9a-f]{40}$/.test(expectedSource ?? "")) fail("requested source SHA is not 40 hex");
if (expectedHarness !== expectedSource) fail("harness SHA must equal the application source SHA");
if (!requestPath || !existsSync(requestPath)) fail(`request file is missing: ${requestPath}`);

let request;
try {
  request = JSON.parse(readFileSync(requestPath, "utf8"));
} catch (error) {
  fail(`request file is not valid JSON: ${error.message}`);
}
if (request.applicationSourceSha !== expectedSource) {
  fail(`request source SHA mismatch: ${request.applicationSourceSha} != ${expectedSource}`);
}
if (request.harnessSha !== expectedHarness) {
  fail(`request harness SHA mismatch: ${request.harnessSha} != ${expectedHarness}`);
}
if (request.budget?.dispatches !== 1 || request.budget?.attempts !== 1) {
  fail("request must authorize exactly one dispatch and one attempt");
}
if (request.customerAdmission !== "closed") fail("request must keep customer admission closed");

console.log(JSON.stringify({
  ok: true,
  trigger: "initial-branch-creation",
  ref,
  workflowSha,
  applicationSourceSha: expectedSource,
  harnessSha: expectedHarness,
}, null, 2));
