import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// js-yaml is pinned in package-lock.json as a dev dependency of
// @eslint/eslintrc and is hoisted to node_modules during npm ci.
const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const workflows = [
  ".github/workflows/builder-retained-image-qualification.yml",
  ".github/workflows/builder-browser-smoke.yml",
];

function findBash() {
  if (process.env.BASH) return process.env.BASH;
  if (process.platform === "win32") {
    for (const candidate of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "bash";
}

function shellRunBlocks(workflowText) {
  const parsed = yaml.load(workflowText);
  assert.ok(parsed && typeof parsed === "object", "workflow must decode to an object");
  const blocks = [];
  for (const [jobName, job] of Object.entries(parsed.jobs ?? {})) {
    for (const [index, step] of (job.steps ?? []).entries()) {
      if (typeof step.run !== "string") continue;
      const shell = step.shell ?? "bash";
      if (!/^bash(\s|$)/.test(shell)) continue;
      blocks.push({
        jobName,
        index,
        name: step.name ?? `step-${index}`,
        script: step.run,
      });
    }
  }
  return blocks;
}

function syntaxCheck(blocks, directory) {
  const bash = findBash();
  const failures = [];
  for (const block of blocks) {
    const file = path.join(directory, `${block.jobName}-${block.index}.sh`);
    writeFileSync(file, block.script, "utf8");
    const result = spawnSync(bash, ["-n", file], { encoding: "utf8" });
    if (result.status !== 0) {
      failures.push({
        jobName: block.jobName,
        step: block.name,
        error: (result.stderr || result.stdout || "").trim(),
      });
    }
  }
  return failures;
}

test("every Bash run block in the retained workflows passes YAML-decoded bash -n", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ornigami-workflow-shell-"));
  try {
    let checked = 0;
    for (const workflowPath of workflows) {
      const blocks = shellRunBlocks(execFileSync("git", ["show", `HEAD:${workflowPath}`], {
        encoding: "utf8",
      }));
      assert.ok(blocks.length > 0, `${workflowPath} must contain Bash run blocks`);
      checked += blocks.length;
      assert.deepEqual(syntaxCheck(blocks, directory), [], workflowPath);
    }
    assert.ok(checked >= 10, `expected a meaningful number of blocks, got ${checked}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the historical indented heredoc is caught by the same YAML-decoded check", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ornigami-workflow-shell-old-"));
  try {
    const fixture = readFileSync("tests/fixtures/builder-bad-heredoc-workflow.yml", "utf8");
    const fixtureFailures = syntaxCheck(shellRunBlocks(fixture), directory);
    assert.ok(fixtureFailures.length >= 1, "historical bad heredoc fixture must be rejected");
    assert.ok(
      fixtureFailures.some((entry) => /unexpected end of file|syntax error/i.test(entry.error)),
      JSON.stringify(fixtureFailures),
    );

    // A shallow CI checkout may not contain the historical commit. When it is
    // available, check the actual historical workflow as a second witness.
    try {
      const historical = execFileSync(
        "git",
        [
          "show",
          "e3d8a1d1844cd647d1d63f7e6185c185e33b9911:.github/workflows/builder-retained-image-qualification.yml",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const failures = syntaxCheck(shellRunBlocks(historical), directory);
      assert.ok(failures.length >= 1, "historical bad heredoc must be rejected");
      assert.ok(
        failures.some((entry) => /unexpected end of file|syntax error/i.test(entry.error)),
        JSON.stringify(failures),
      );
    } catch (error) {
      if (error?.status !== 128) throw error;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
