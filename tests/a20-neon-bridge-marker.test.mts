import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

const sourceBridge = resolve("scripts/a20-neon-bridge.mjs");
const databaseUrl = "postgresql://a20_fixture:a20_fixture@ep-a20-fixture.neon.tech/a20_fixture?sslmode=require";
const localDatabaseUrl = "postgresql://postgres@127.0.0.1:55432/a20_browser_fixture";

function isolatedChildEnv() {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const key of ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "WINDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, DATABASE_URL: databaseUrl, A20_DATABASE_URL: localDatabaseUrl };
}

function assertSafeTempRoot(root: string, parent: string) {
  const stat = lstatSync(root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), "temporary project root must be a real directory");
  const resolvedRoot = realpathSync(root);
  const relativeRoot = relative(parent, resolvedRoot);
  assert.equal(resolve(resolvedRoot), resolve(root), "temporary project root must not resolve through a junction");
  assert.ok(basename(resolvedRoot).startsWith("a20-bridge-marker-"), "temporary project root must retain its task-specific prefix");
  assert.ok(relativeRoot && relativeRoot !== ".." && !relativeRoot.startsWith(`..${sep}`) && !isAbsolute(relativeRoot), "temporary project root must stay under the system temp directory");
  return resolvedRoot;
}

function tempProject(t: TestContext) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, "a20-bridge-marker-"));
  const resolvedRoot = assertSafeTempRoot(root, parent);
  const scripts = join(root, "scripts");
  mkdirSync(scripts, { recursive: true });
  copyFileSync(sourceBridge, join(scripts, "a20-neon-bridge.mjs"));
  t.after(() => rmSync(assertSafeTempRoot(root, parent), { recursive: true, force: true }));
  assert.equal(resolvedRoot, root);
  return { root, fixture: join(root, ".a20-fixture") };
}

function writeMarker(fixture: string, overrides: Record<string, unknown> = {}) {
  const clusterPath = join(fixture, "postgres", "data");
  mkdirSync(clusterPath, { recursive: true });
  writeFileSync(join(fixture, "marker.json"), JSON.stringify({
    task: "A20",
    version: 1,
    state: "ready",
    database: "a20_browser_fixture",
    host: "127.0.0.1",
    port: 55432,
    fixtureRoot: fixture,
    clusterPath,
    ...overrides,
  }));
}

function runInstallProbe(root: string) {
  const childPath = join(root, "install-probe.mjs");
  writeFileSync(childPath, `
    import { Socket } from "node:net";
    const fetchBefore = globalThis.fetch;
    let socketCalls = 0;
    Socket.prototype.connect = function () { socketCalls++; throw new Error("A20 marker test blocked unexpected socket access"); };
    const instrumentedSocketConnect = Socket.prototype.connect;
    const { installA20NeonBridge } = await import("./scripts/a20-neon-bridge.mjs");
    let rejected = false;
    try { await installA20NeonBridge(); } catch { rejected = true; }
    console.log(JSON.stringify({ rejected, fetchUnchanged: globalThis.fetch === fetchBefore, socketHookUnchanged: Socket.prototype.connect === instrumentedSocketConnect, socketCalls }));
  `);
  const result = spawnSync(process.execPath, [childPath], { cwd: root, encoding: "utf8", windowsHide: true, env: isolatedChildEnv(), timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim()) as { rejected: boolean; fetchUnchanged: boolean; socketHookUnchanged: boolean; socketCalls: number };
}

function assertRejectedBeforeNetwork(result: ReturnType<typeof runInstallProbe>) {
  assert.deepEqual(result, { rejected: true, fetchUnchanged: true, socketHookUnchanged: true, socketCalls: 0 });
}

test("A20 bridge refuses a missing marker before replacing fetch or opening a socket", (t) => {
  const { root, fixture } = tempProject(t);
  mkdirSync(fixture, { recursive: true });
  assertRejectedBeforeNetwork(runInstallProbe(root));
});

test("A20 bridge refuses a foreign task marker before replacing fetch or opening a socket", (t) => {
  const { root, fixture } = tempProject(t);
  writeMarker(fixture, { task: "A19" });
  assertRejectedBeforeNetwork(runInstallProbe(root));
});

test("A20 bridge refuses a fixture-root junction even when marker paths use its lexical name", (t) => {
  const { root, fixture } = tempProject(t);
  const externalFixture = join(root, "foreign-fixture");
  mkdirSync(externalFixture, { recursive: true });
  try { symlinkSync(externalFixture, fixture, "junction"); }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES", "UNKNOWN"].includes(String((error as NodeJS.ErrnoException).code))) {
      t.skip("Windows did not allow creation of a disposable directory junction");
      return;
    }
    throw error;
  }
  writeMarker(fixture, { fixtureRoot: fixture, clusterPath: join(fixture, "postgres", "data") });
  assertRejectedBeforeNetwork(runInstallProbe(root));
});
