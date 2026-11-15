#!/usr/bin/env node
/**
 * Pre-integration self-test for the campaign-lab acceptance runner.
 *
 * Starts the synthetic contract fixture, runs the acceptance runner against it,
 * then runs the same runner against deliberate faults and checks that the
 * expected checks fail. This verifies the runner's setup without the app route
 * or renderer and keeps all evidence under .local/ (Git-ignored).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverEntry = path.join(root, "tests", "fixtures", "campaign-lab", "server.mjs");
const manifestPath = path.join(root, "tests", "fixtures", "campaign-lab", "contract-manifest.json");
const runner = path.join(root, "scripts", "campaign-lab-acceptance.mjs");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "Z");
const outRoot = path.join(root, ".local", "campaign-lab-acceptance", `self-test-${stamp}`);
mkdirSync(outRoot, { recursive: true });

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: { ...process.env, CAMPAIGN_LAB_CONTRACT_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(message));
    };
    child.stdout.on("data", (bytes) => {
      output += bytes.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match && !settled) {
        settled = true;
        resolve({ child, url: match[0] });
      }
    });
    child.stderr.on("data", (bytes) => { output += bytes.toString(); });
    child.on("error", (error) => fail(`Contract fixture failed to start: ${error.message}`));
    child.on("exit", (code) => { if (!settled) fail(`Contract fixture exited before listening (code ${code}): ${output}`); });
    setTimeout(() => fail("Contract fixture did not print its URL within 10 seconds."), 10_000).unref();
  });
}

function runAcceptance(out, manifest, extra = []) {
  const result = spawnSync(process.execPath, [runner, "--url", serverUrl, "--manifest", manifest, "--out", out, "--require-approved", ...extra], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 240_000,
  });
  const reportPath = path.join(out, "report.json");
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

let serverUrl = "";
const server = await startServer();
serverUrl = server.url;
let exitCode = 0;
try {
  const cleanOut = path.join(outRoot, "clean");
  const clean = runAcceptance(cleanOut, manifestPath);
  const cleanFailures = clean.report?.failures?.map((check) => check.id) ?? [];
  const cleanPending = clean.report?.pending?.length ?? 0;
  console.log(`clean contract run: exit ${clean.status}, ${clean.report?.counts?.passed ?? 0} passed, ${cleanFailures.length} failed, ${cleanPending} pending`);
  if (clean.status !== 0 || !clean.report?.pass || cleanFailures.length || cleanPending) {
    console.error(clean.stdout);
    console.error(clean.stderr);
    console.error("FAIL: the approval runner did not pass its clean contract fixture.");
    exitCode = 1;
  }

  const faultManifestPath = path.join(outRoot, "fault-manifest.json");
  const faultManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const fault = "href,alt,image,overflow,approval,errors,focus,legibility";
  for (const fixture of faultManifest.fixtures) fixture.url = `${fixture.url}&fault=${fault}`;
  writeFileSync(faultManifestPath, `${JSON.stringify(faultManifest, null, 2)}\n`);
  const faultOut = path.join(outRoot, "fault");
  const faultRun = runAcceptance(faultOut, faultManifestPath);
  const failedIds = new Set((faultRun.report?.failures ?? []).map((check) => check.id));
  const expectedFailures = [
    "product-image-loads",
    "product-asset-matches-approved",
    "product-alt-matches-approved",
    "cta-exact-destination",
    "no-horizontal-overflow",
    "edit-invalidates-approval",
    "cta-keyboard-reachable",
    "legibility-offer",
    "cta-keyboard-activation",
  ];
  const missing = expectedFailures.filter((id) => !failedIds.has(id));
  console.log(`fault contract run: exit ${faultRun.status}, ${failedIds.size} failed check id(s)`);
  if (faultRun.status !== 1 || missing.length) {
    console.error(faultRun.stdout);
    console.error(faultRun.stderr);
    console.error(`FAIL: the runner did not report these expected fault checks: ${missing.join(", ") || "(none missing)"}`);
    exitCode = 1;
  }
  if (!faultRun.report?.captures?.length) {
    console.error("FAIL: the fault run produced no human-review captures.");
    exitCode = 1;
  }
  console.log(`\nSelf-test artifacts: ${path.relative(root, outRoot)}`);
  console.log(`Clean report:   ${path.relative(root, path.join(cleanOut, "report.md"))}`);
  console.log(`Fault report:   ${path.relative(root, path.join(faultOut, "report.md"))}`);
  if (exitCode === 0) console.log("\nPASS: runner setup verified in isolation; fixture-dependent checks were not run against the app route.");
} finally {
  server.child.kill();
}
process.exitCode = exitCode;
