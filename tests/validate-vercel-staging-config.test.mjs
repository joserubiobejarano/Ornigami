import assert from "node:assert/strict";
import test from "node:test";
import { validateGitConfig } from "../scripts/validate-vercel-staging-config.mjs";

const minimal = { $schema: "https://openapi.vercel.sh/vercel.json" };

test("schedule-free Git configuration matches the reviewed staging config", () => {
  assert.doesNotThrow(() => validateGitConfig(minimal, minimal));
});

test("Git-consumed root configuration rejects any cron declaration", () => {
  for (const crons of [[], [{ path: "/api/cron/test", schedule: "0 * * * *" }]]) {
    assert.throws(
      () => validateGitConfig({ ...minimal, crons }, minimal),
      /must not declare cron schedules/,
    );
  }
});

test("Git-consumed root configuration rejects other unreviewed settings", () => {
  assert.throws(
    () => validateGitConfig({ ...minimal, rewrites: [] }, minimal),
    /must remain minimal and schedule-free/,
  );
});
