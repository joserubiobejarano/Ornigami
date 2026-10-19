import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gatePath = resolve(repositoryRoot, "scripts/vercel/preview-only-ignored-build-step.sh");
const selectedBranch = "codex/ornigami-staging-readiness-20261018";
const gateRecipe = readFileSync(gatePath, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n")
  .trim();

function findBash() {
  const candidates = [
    process.env.BASH,
    process.platform === "win32" && process.env.ProgramFiles
      ? resolve(process.env.ProgramFiles, "Git/bin/bash.exe")
      : undefined,
    process.platform === "win32" && process.env.ProgramFiles
      ? resolve(process.env.ProgramFiles, "Git/usr/bin/bash.exe")
      : undefined,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? resolve(process.env.LOCALAPPDATA, "Programs/Git/bin/bash.exe")
      : undefined,
    "bash",
  ].filter(Boolean);

  return candidates.find((candidate) => candidate === "bash" || existsSync(candidate));
}

const bash = findBash();
assert.ok(bash, "Bash is required to exercise the actual Vercel build-gate recipe");

function runGate(overrides = {}) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };
  for (const key of ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF"]) {
    if (Object.hasOwn(overrides, key)) env[key] = overrides[key];
  }

  const result = spawnSync(bash, ["-c", gateRecipe], { encoding: "utf8", env });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "");
  assert.ok([0, 1].includes(result.status), `unexpected gate exit status ${result.status}`);
  return result.status;
}

test("Vercel build gate continues only the exact selected Preview branch", () => {
  assert.equal(runGate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: selectedBranch }), 1);
});

test("the exact inline recipe is syntactically valid Bash", () => {
  const result = spawnSync(bash, ["-n", "-c", gateRecipe], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("other Preview branches are canceled", () => {
  assert.equal(runGate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/unrelated" }), 0);
});

test("Production application builds remain canceled, including on the selected ref", () => {
  assert.equal(runGate({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: selectedBranch }), 0);
  assert.equal(runGate({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), 0);
});

test("development, unknown environments, and unknown refs fail closed", () => {
  assert.equal(runGate({ VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: selectedBranch }), 0);
  assert.equal(runGate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "" }), 0);
  assert.equal(runGate({ VERCEL_ENV: "unexpected", VERCEL_GIT_COMMIT_REF: selectedBranch }), 0);
  assert.equal(runGate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: `${selectedBranch}-typo` }), 0);
});

test("missing environment or branch metadata fails closed", () => {
  assert.equal(runGate(), 0);
  assert.equal(runGate({ VERCEL_ENV: "preview" }), 0);
  assert.equal(runGate({ VERCEL_GIT_COMMIT_REF: selectedBranch }), 0);
});
