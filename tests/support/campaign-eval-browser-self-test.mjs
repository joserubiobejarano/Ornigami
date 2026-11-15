#!/usr/bin/env node
/**
 * Pre-integration self-test for the focused campaign evaluation browser checks.
 *
 * Starts the pack's fixture double, runs the focused checks against a clean map
 * and a deliberate-fault map, and asserts that the added checks separate the
 * two. This verifies the checks without the app route, renderer, or provider
 * adapter. All evidence stays under .local/ (Git-ignored).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverEntry = path.join(root, "tests", "fixtures", "campaign-eval", "server.mjs");
const browserScript = path.join(root, "scripts", "campaign-eval-browser.mjs");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
const outRoot = path.join(root, ".local", "campaign-eval-browser", `self-test-${stamp}`);
mkdirSync(outRoot, { recursive: true });

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: { ...process.env, CAMPAIGN_EVAL_PORT: "0" },
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
    child.on("error", (error) => fail(`Fixture double failed to start: ${error.message}`));
    child.on("exit", (code) => { if (!settled) fail(`Fixture double exited before listening (code ${code}): ${output}`); });
    setTimeout(() => fail("Fixture double did not print its URL within 10 seconds."), 10_000).unref();
  });
}

function runBrowser(urlsFile, outDir) {
  const result = spawnSync(process.execPath, [browserScript, "--urls", urlsFile, "--out", outDir], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 240_000,
  });
  const reportPath = path.join(outDir, "browser-report.json");
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

function urlMap(base, fault = false) {
  const source = (caseId, entrySource) => `${base}/case/${caseId}?source=${entrySource}`;
  return {
    "sparse-offer": {
      generated: source("sparse-offer", fault ? "failure" : "generated"),
      baseline: source("sparse-offer", "baseline"),
    },
    "rich-angle": {
      generated: source("rich-angle", "generated"),
      baseline: source("rich-angle", "baseline"),
    },
    "intent-change": {
      generated: source("intent-change", fault ? "unchanged" : "generated"),
      baseline: source("intent-change", "baseline"),
    },
    "failure-revision": {
      after: source("failure-revision", fault ? "stale" : "after"),
      before: source("failure-revision", "before"),
    },
    "trap-asset-label": {
      generated: source("trap-asset-label", "generated"),
      baseline: source("trap-asset-label", "baseline"),
    },
  };
}

let server;
let exitCode = 0;
try {
  server = await startServer();
  const cleanMapPath = path.join(outRoot, "clean-urls.json");
  const faultMapPath = path.join(outRoot, "fault-urls.json");
  writeFileSync(cleanMapPath, `${JSON.stringify(urlMap(server.url), null, 2)}\n`);
  writeFileSync(faultMapPath, `${JSON.stringify(urlMap(server.url, true), null, 2)}\n`);

  const clean = runBrowser(cleanMapPath, path.join(outRoot, "clean"));
  const cleanFailures = clean.report?.checks?.filter((item) => item.state === "failed").map((item) => item.id) ?? [];
  const cleanUnassessed = clean.report?.checks?.filter((item) => item.state === "unassessed").map((item) => item.id) ?? [];
  console.log(`clean browser run: exit ${clean.status}, ${clean.report?.counts?.passed ?? 0} passed, ${cleanFailures.length} failed, ${cleanUnassessed.length} unassessed`);
  if (clean.status !== 0 || cleanFailures.length) {
    console.error(clean.stdout);
    console.error(clean.stderr);
    console.error(`FAIL: clean fixture map produced failures: ${cleanFailures.join(", ") || "(none)"}`);
    exitCode = 1;
  }
  for (const id of ["brand-and-evidence-distinct", "intent-opening-shift", "revision-old-values-absent"]) {
    if (!clean.report?.checks?.some((item) => item.id === id && item.state === "passed")) {
      console.error(`FAIL: clean run did not pass ${id}.`);
      exitCode = 1;
    }
  }
  if (!clean.report?.checks?.some((item) => item.id === "packaging-truth-human-only" && item.state === "unassessed")) {
    console.error("FAIL: the trap must report packaging truth as unassessed.");
    exitCode = 1;
  }

  const fault = runBrowser(faultMapPath, path.join(outRoot, "fault"));
  const faultFailed = new Set(fault.report?.checks?.filter((item) => item.state === "failed").map((item) => item.id) ?? []);
  const expectedFailures = [
    "unsupported-claims-sparse-offer-generated",
    "intent-opening-shift",
    "revision-old-values-absent",
  ];
  const missing = expectedFailures.filter((id) => !faultFailed.has(id));
  console.log(`fault browser run: exit ${fault.status}, ${faultFailed.size} failed check(s)`);
  if (fault.status !== 1 || missing.length) {
    console.error(fault.stdout);
    console.error(fault.stderr);
    console.error(`FAIL: the focused checks did not report: ${missing.join(", ") || "(none missing)"}`);
    exitCode = 1;
  }
  if (!fault.report?.captures?.length) {
    console.error("FAIL: the fault run produced no review captures.");
    exitCode = 1;
  }

  console.log(`\nSelf-test artifacts: ${path.relative(root, outRoot)}`);
  if (exitCode === 0) {
    console.log("PASS: focused browser checks verified against the fixture double; app route and renderer were not used.");
  }
} finally {
  server?.child.kill();
}
process.exitCode = exitCode;
