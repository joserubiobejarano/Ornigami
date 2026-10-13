#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { collectVpsPreflight } from "./vps-preflight-checks.mjs";

const { problems, notes } = collectVpsPreflight({ existsSync, statSync, spawnSync, platform: process.platform });
for (const note of notes) console.log(`NOTE: ${note}`);
if (problems.length) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exitCode = 1;
} else {
  console.log("VPS runtime preflight passed.");
}
