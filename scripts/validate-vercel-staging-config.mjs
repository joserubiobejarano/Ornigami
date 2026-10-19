import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readConfig(name) {
  return JSON.parse(await readFile(resolve(root, name), "utf8"));
}

const production = await readConfig("vercel.json");
const staging = await readConfig("vercel.staging.json");
const expectedProductionCrons = [
  { path: "/api/cron/privacy", schedule: "0 3 * * *" },
  { path: "/api/cron/review-booster", schedule: "7 * * * *" },
  { path: "/api/cron/review-replies", schedule: "11 */4 * * *" },
];

assert.deepEqual(production.crons, expectedProductionCrons, "default production schedules changed");
assert.equal(Object.hasOwn(staging, "crons"), false, "staging config must not declare cron schedules");
assert.deepEqual(Object.keys(staging), ["$schema"], "staging config must remain schedule-free and minimal");

console.log("PASS: default schedules are preserved; selected staging config declares no crons.");
