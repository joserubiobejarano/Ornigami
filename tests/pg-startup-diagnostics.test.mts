import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { capturePgStartupFailure } from "./pg-startup-diagnostics.mts";

test("disposable PostgreSQL startup evidence survives finally cleanup", () => {
  const disposable = mkdtempSync(join(os.tmpdir(), "pg-startup-disposable-"));
  const evidenceRoot = mkdtempSync(join(os.tmpdir(), "pg-startup-evidence-"));
  const previousRoot = process.env.PG_STARTUP_DIAGNOSTICS_ROOT;
  process.env.PG_STARTUP_DIAGNOSTICS_ROOT = evidenceRoot;
  try {
    const logFile = join(disposable, "postgres.log");
    writeFileSync(logFile, "FATAL: synthetic startup failure\n");
    const evidenceDir = capturePgStartupFailure({
      label: "regression",
      pgBin: disposable,
      port: 55416,
      dataDir: join(disposable, "data"),
      logFile,
      exitStatus: 1,
      signal: null,
      stdout: "",
      stderr: "pg_ctl: synthetic startup failure",
      command: "pg_ctl -D data -w start",
      error: new Error("synthetic"),
    });

    assert.equal(existsSync(join(evidenceDir, "STARTUP_FAILED")), true);
    assert.match(readFileSync(join(evidenceDir, "STARTUP_FAILED"), "utf8"), /exitStatus=1/);
    assert.match(readFileSync(join(evidenceDir, "pg_ctl.stderr"), "utf8"), /synthetic startup failure/);
    assert.match(readFileSync(join(evidenceDir, "postgres.log"), "utf8"), /FATAL: synthetic/);
    assert.equal(existsSync(join(evidenceDir, "listeners.txt")), true);
    assert.equal(existsSync(join(evidenceDir, "ownership.txt")), true);
    assert.equal(existsSync(join(evidenceDir, "toolchain.txt")), true);
    assert.equal(existsSync(join(evidenceDir, "pg_env.txt")), true);

    // The caller's finally removes only the disposable data directory.
    rmSync(disposable, { recursive: true, force: true });
    assert.equal(existsSync(join(evidenceDir, "STARTUP_FAILED")), true);
    assert.equal(existsSync(join(evidenceDir, "postgres.log")), true);
  } finally {
    if (previousRoot === undefined) delete process.env.PG_STARTUP_DIAGNOSTICS_ROOT;
    else process.env.PG_STARTUP_DIAGNOSTICS_ROOT = previousRoot;
    rmSync(disposable, { recursive: true, force: true });
    rmSync(evidenceRoot, { recursive: true, force: true });
  }
});
