import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateSyntheticStagingFixture } from "../scripts/staging-synthetic-fixture-core.mjs";

const root = resolve(import.meta.dirname, "..");

function normalizeNewlines(value) {
  return value.replace(/\r\n?/g, "\n");
}

/**
 * Applies one exact fixture mutation while preserving the source's line ending.
 * A no-op replacement is a test bug, not an accepted fixture, so fail loudly.
 */
function mutate(source, search, replacement) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = normalizeNewlines(source);
  const mutated = normalized.replace(search, replacement);
  assert.notEqual(
    mutated,
    normalized,
    `mutation did not change the input: ${search.slice(0, 80)}`,
  );
  return newline === "\r\n" ? mutated.replaceAll("\n", "\r\n") : mutated;
}

function rejectUnderBothLineEndings(...mutations) {
  const results = [];
  for (const source of [fixture, crlfFixture]) {
    let mutated = source;
    for (const [search, replacement] of mutations) {
      mutated = mutate(mutated, search, replacement);
    }
    results.push(validateSyntheticStagingFixture(mutated, migrations));
  }
  for (const result of results) assert.equal(result.ok, false);
  return results;
}

const fixtureSource = readFileSync(
  join(root, "neon/fixtures/ornigami-staging-synthetic.sql"),
  "utf8",
);
const fixture = normalizeNewlines(fixtureSource);
const crlfFixture = fixture.replaceAll("\n", "\r\n");
const migrations = readdirSync(join(root, "neon/migrations"))
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort((left, right) => Number(left.slice(0, 3)) - Number(right.slice(0, 3)))
  .map((name) => readFileSync(join(root, "neon/migrations", name), "utf8"));

test("synthetic fixture is limited to migrated display tables and synthetic values", () => {
  for (const source of [fixture, crlfFixture]) {
    const result = validateSyntheticStagingFixture(source, migrations);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.insertedTables, ["users", "profiles", "businesses", "business_members", "reviews"]);
    assert.deepEqual(result.rowCounts, { users: 1, profiles: 1, businesses: 1, business_members: 1, reviews: 1 });
  }
  assert.doesNotMatch(fixture, /password_hash|access_token|refresh_token|api[_-]?key|secret/i);
  assert.match(fixture, /preview\.owner@ornigami\.example\.test/);
});

test("fixture rejects actionable delivery tables", () => {
  rejectUnderBothLineEndings([
    "COMMIT;",
    "INSERT INTO public.followup_messages (id) VALUES ('x');\nCOMMIT;",
  ]);
});

test("fixture rejects operational credential fields and non-reserved identity values", () => {
  rejectUnderBothLineEndings([
    "(id, email, name)",
    "(id, email, name, password_hash)",
  ], [
    "'Example Preview Owner'\n);",
    "'Example Preview Owner', 'not-a-real-hash'\n);",
  ]);
  rejectUnderBothLineEndings([
    "preview.owner@ornigami.example.test",
    "owner@example.com",
  ]);
});

test("fixture rejects DDL, updates, or scheduling additions", () => {
  rejectUnderBothLineEndings([
    "COMMIT;",
    "UPDATE public.users SET name='changed';\nCOMMIT;",
  ]);
  rejectUnderBothLineEndings([
    "COMMIT;",
    "CREATE TABLE public.unexpected (id text);\nCOMMIT;",
  ]);
  rejectUnderBothLineEndings([
    "COMMIT;",
    "INSERT INTO public.cron_runs (id) VALUES ('x');\nCOMMIT;",
  ]);
});

test("fixture validation fails when a referenced migration column is absent", () => {
  let removed = 0;
  const incompleteMigrations = migrations.map((migration) => {
    if (!migration.includes("  language_code TEXT,")) return migration;
    removed += 1;
    return mutate(migration, "  language_code TEXT,", "");
  });
  assert.equal(removed, 1);
  const result = validateSyntheticStagingFixture(fixture, incompleteMigrations);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("reviews.language_code")));
});

test("fixture rejects an additional user row with an outside identity", () => {
  const results = rejectUnderBothLineEndings([
    "INSERT INTO public.profiles",
    "INSERT INTO public.users (id, email, name) VALUES ('6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099', 'other@outside.invalid', 'Outside User');\n\nINSERT INTO public.profiles",
  ]);
  for (const result of results) {
    assert.ok(result.errors.some((error) => error.includes("unexpected table users")));
  }
});

test("fixture rejects ON CONFLICT mutation appended to the owner insert", () => {
  rejectUnderBothLineEndings([
    ");\n\nINSERT INTO public.profiles",
    ") ON CONFLICT (id) DO UPDATE SET name = 'Changed';\n\nINSERT INTO public.profiles",
  ]);
});

test("fixture rejects inconsistent owner, membership, or review business references", () => {
  rejectUnderBothLineEndings([
    "'6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',\n  'Example Studio 001'",
    "'6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099',\n  'Example Studio 001'",
  ]);
  rejectUnderBothLineEndings([
    "INSERT INTO public.business_members (business_id, user_id, role)\nVALUES (\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'",
    "INSERT INTO public.business_members (business_id, user_id, role)\nVALUES (\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099'",
  ]);
  rejectUnderBothLineEndings([
    "  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  'Example Studio 001'",
    "  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099',\n  'Example Studio 001'",
  ]);
});

test("fixture rejects expressions, function calls, and trailing clauses", () => {
  rejectUnderBothLineEndings([
    "'Example Preview Owner'\n);",
    "now()\n);",
  ]);
  rejectUnderBothLineEndings([
    ");\n\nINSERT INTO public.profiles",
    ") WHERE true;\n\nINSERT INTO public.profiles",
  ]);
});
