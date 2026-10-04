import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { baseA20ChildEnv, isExpectedA20App, resolveFixturePath, validateA20Marker } from "../scripts/a20-app-fixture-core.mjs";

test("fixture cleanup path guard rejects the root, its parent and prefix lookalikes", () => {
  const root = resolve("C:/work/Ornigami/.a20-fixture");
  assert.equal(resolveFixturePath(root, join(root, "postgres", "data")), join(root, "postgres", "data"));
  for (const target of [root, resolve("C:/work/Ornigami"), resolve("C:/work/Ornigami/.a20-fixture-copy/data")]) {
    assert.throws(() => resolveFixturePath(root, target), /outside the A20 fixture root/);
  }
});

test("fixture marker guard requires task, state, target database and canonical paths to agree", () => {
  const expected = { database: "a20_browser_fixture", port: 54321, fixtureRoot: "C:/work/.a20-fixture", clusterPath: "C:/work/.a20-fixture/postgres/data" };
  const marker = { task: "A20", version: 1, state: "ready", database: expected.database, host: "127.0.0.1", port: expected.port, fixtureRoot: expected.fixtureRoot, clusterPath: expected.clusterPath };
  assert.doesNotThrow(() => validateA20Marker(marker, expected));
  for (const change of [{ state: "starting" }, { database: "production" }, { host: "203.0.113.1" }, { fixtureRoot: "C:/elsewhere" }, { clusterPath: "C:/work/.a20-fixture-other/db" }, { version: 2 }]) {
    assert.throws(() => validateA20Marker({ ...marker, ...change }, expected), /marker identity/);
  }
});

test("shutdown only recognizes a recorded A20 Next process with this preload and binary", () => {
  const root = resolve("fixture-test");
  const paths = { preload: join(root, "scripts", "a20-preload.mjs"), nextBin: join(root, "node_modules", "next", "dist", "bin", "next") };
  const preloadUrl = pathToFileURL(paths.preload).href;
  assert.equal(isExpectedA20App(`node.exe --import ${preloadUrl} ${paths.nextBin} start -H 127.0.0.1`, paths), true);
  assert.equal(isExpectedA20App(`node ${paths.nextBin} start`, paths), false);
  assert.equal(isExpectedA20App(`unrelated.exe --import ${paths.preload} ${paths.nextBin} start`, paths), false);
});

test("app child environment drops inherited production, proxy, PostgreSQL and Node options", () => {
  const preload = join(resolve("work"), "scripts", "a20-preload.mjs");
  const env: Record<string, string | undefined> = baseA20ChildEnv({
    PATH: "safe-path", SystemRoot: "C:/Windows", DATABASE_URL: "postgres://production",
    HTTP_PROXY: "http://proxy.invalid", NODE_OPTIONS: "--require=secret.js", PGSERVICEFILE: "production-service",
    RESEND_API_KEY: "real-provider-key", AUTH_SECRET: "real-auth-secret",
  }, { appPort: 43021, preload });
  assert.equal(env.PATH, "safe-path");
  assert.equal(env.PORT, "43021");
  assert.equal(env.NEXT_PUBLIC_APP_URL, "http://127.0.0.1:43021");
  assert.equal(env.NODE_OPTIONS, `--import=${pathToFileURL(preload).href}`);
  for (const key of ["DATABASE_URL", "HTTP_PROXY", "PGSERVICEFILE", "RESEND_API_KEY", "AUTH_SECRET"]) assert.equal(env[key], undefined);
});
