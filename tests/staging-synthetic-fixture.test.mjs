import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { validateSyntheticStagingFixture } from "../scripts/staging-synthetic-fixture-core.mjs";

const root = resolve(import.meta.dirname, "..");
const fixture = readFileSync(join(root, "neon/fixtures/ornigami-staging-synthetic.sql"), "utf8");
const migrations = readdirSync(join(root, "neon/migrations"))
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort((left, right) => Number(left.slice(0, 3)) - Number(right.slice(0, 3)))
  .map((name) => readFileSync(join(root, "neon/migrations", name), "utf8"));

test("synthetic fixture is limited to migrated display tables and synthetic values", () => {
  const result = validateSyntheticStagingFixture(fixture, migrations);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.insertedTables, ["users", "profiles", "businesses", "business_members", "reviews"]);
  assert.deepEqual(result.rowCounts, { users: 1, profiles: 1, businesses: 1, business_members: 1, reviews: 1 });
  assert.doesNotMatch(fixture, /password_hash|access_token|refresh_token|api[_-]?key|secret/i);
  assert.match(fixture, /preview\.owner@ornigami\.example\.test/);
});

test("fixture rejects actionable delivery tables", () => {
  const result = validateSyntheticStagingFixture(`${fixture.replace("COMMIT;", "INSERT INTO public.followup_messages (id) VALUES ('x');\nCOMMIT;")}`, migrations);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("fixture rejects operational credential fields and non-reserved identity values", () => {
  const withCredential = fixture.replace("(id, email, name)", "(id, email, name, password_hash)").replace("'Example Preview Owner'\n);", "'Example Preview Owner', 'not-a-real-hash'\n);");
  assert.equal(validateSyntheticStagingFixture(withCredential, migrations).ok, false);
  const withRealDomain = fixture.replace("preview.owner@ornigami.example.test", "owner@example.com");
  assert.equal(validateSyntheticStagingFixture(withRealDomain, migrations).ok, false);
});

test("fixture rejects DDL, updates, or scheduling additions", () => {
  const withMutation = fixture.replace("COMMIT;", "UPDATE public.users SET name='changed';\nCOMMIT;");
  assert.equal(validateSyntheticStagingFixture(withMutation, migrations).ok, false);
  const withDdl = fixture.replace("COMMIT;", "CREATE TABLE public.unexpected (id text);\nCOMMIT;");
  assert.equal(validateSyntheticStagingFixture(withDdl, migrations).ok, false);
  const withSchedule = fixture.replace("COMMIT;", "INSERT INTO public.cron_runs (id) VALUES ('x');\nCOMMIT;");
  assert.equal(validateSyntheticStagingFixture(withSchedule, migrations).ok, false);
});

test("fixture validation fails when a referenced migration column is absent", () => {
  const incompleteMigrations = migrations.map((migration) => migration.replace("  language_code TEXT,", ""));
  const result = validateSyntheticStagingFixture(fixture, incompleteMigrations);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("reviews.language_code")));
});

test("fixture rejects an additional user row with an outside identity", () => {
  const additionalUser = "INSERT INTO public.users (id, email, name) VALUES ('6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099', 'other@outside.invalid', 'Outside User');\n\n";
  const mutated = fixture.replace("INSERT INTO public.profiles", `${additionalUser}INSERT INTO public.profiles`);
  const result = validateSyntheticStagingFixture(mutated, migrations);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("unexpected table users")));
});

test("fixture rejects ON CONFLICT mutation appended to the owner insert", () => {
  const mutated = fixture.replace(");\n\nINSERT INTO public.profiles", ") ON CONFLICT (id) DO UPDATE SET name = 'Changed';\n\nINSERT INTO public.profiles");
  const result = validateSyntheticStagingFixture(mutated, migrations);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("fixture rejects inconsistent owner, membership, or review business references", () => {
  const unknownOwner = fixture.replace(
    "'6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',\n  'Example Studio 001'",
    "'6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099',\n  'Example Studio 001'",
  );
  const unknownMember = fixture.replace(
    "INSERT INTO public.business_members (business_id, user_id, role)\nVALUES (\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001'",
    "INSERT INTO public.business_members (business_id, user_id, role)\nVALUES (\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099'",
  );
  const unknownReviewBusiness = fixture.replace(
    "  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',\n  'Example Studio 001'",
    "  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',\n  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0099',\n  'Example Studio 001'",
  );
  for (const mutated of [unknownOwner, unknownMember, unknownReviewBusiness]) {
    assert.equal(validateSyntheticStagingFixture(mutated, migrations).ok, false);
  }
});

test("fixture rejects expressions, function calls, and trailing clauses", () => {
  const withFunction = fixture.replace("'Example Preview Owner'\n);", "now()\n);");
  assert.equal(validateSyntheticStagingFixture(withFunction, migrations).ok, false);
  const withTrailingClause = fixture.replace(");\n\nINSERT INTO public.profiles", ") WHERE true;\n\nINSERT INTO public.profiles");
  assert.equal(validateSyntheticStagingFixture(withTrailingClause, migrations).ok, false);
});
