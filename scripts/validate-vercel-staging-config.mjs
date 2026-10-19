import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readConfig(name) {
  return JSON.parse(await readFile(resolve(root, name), "utf8"));
}

export function validateGitConfig(gitConfig, stagingReference) {
  assert.equal(
    Object.hasOwn(gitConfig, "crons"),
    false,
    "Git-consumed root vercel.json must not declare cron schedules",
  );
  assert.deepEqual(
    Object.keys(gitConfig),
    ["$schema"],
    "Git-consumed root vercel.json must remain minimal and schedule-free",
  );
  assert.deepEqual(
    gitConfig,
    stagingReference,
    "Git-consumed root vercel.json must match the reviewed staging reference",
  );
}

async function main() {
  const gitConfig = await readConfig("vercel.json");
  const stagingReference = await readConfig("vercel.staging.json");

  validateGitConfig(gitConfig, stagingReference);

  console.log("PASS: Git-consumed root vercel.json matches the minimal schedule-free staging reference.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
