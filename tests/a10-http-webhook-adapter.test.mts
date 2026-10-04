import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { adaptA20FixtureSource } from "../scripts/a10-http-webhook-acceptance.mjs";

const root = process.cwd();
const canonical = readFileSync(resolve(root, "scripts/a20-app-fixture.mjs"), "utf8");

test("A10 runtime adaptation changes only the pinned A20 root, core import, and synthetic webhook secret", () => {
  const output = adaptA20FixtureSource(canonical, {
    root,
    coreModuleUrl: "file:///test/a20-app-fixture-core.mjs",
  });
  assert.equal(output.includes('const ROOT = "' + root.replaceAll("\\", "\\\\") + '";'), true);
  assert.equal(output.includes('from "file:///test/a20-app-fixture-core.mjs"'), true);
  assert.equal(output.includes('RESEND_WEBHOOK_SECRET: process.env.A10_RESEND_WEBHOOK_SECRET,'), true);
  assert.equal(output.includes('RESEND_WEBHOOK_SECRET: "a20_local_only_resend_secret_never_valid",'), false);
  assert.equal(canonical.includes('RESEND_WEBHOOK_SECRET: "a20_local_only_resend_secret_never_valid",'), true, "canonical A20 source remains untouched");
});

test("A10 runtime adaptation fails closed when a pinned A20 source fragment changes or repeats", () => {
  for (const changed of [canonical.replace('const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");', "const ROOT = process.cwd();"), `${canonical}\n${canonical}`]) {
    assert.throws(() => adaptA20FixtureSource(changed, { root, coreModuleUrl: "file:///test/core.mjs" }), /A20 fixture adaptation refused/);
  }
});
