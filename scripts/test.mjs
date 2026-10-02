import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Explicit discovery also works on Windows, where shells do not expand globs.
const suites = readdirSync("tests")
  .filter((name) => name.endsWith(".test.mts"))
  .sort()
  .map((name) => join("tests", name));
if (!suites.length) throw new Error("No test suites discovered");
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...suites], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
