import assert from "node:assert/strict";
import test from "node:test";
import { fakeSql, loadTs } from "./a02-test-support.mts";
import { decryptToken } from "../src/lib/encrypted-token.ts";

test("OAuth upserts generate and replace the version while ordinary refresh SQL leaves it untouched", async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-google-token-encryption-key";
  let resultRows: unknown[] = [];
  const db = fakeSql(() => resultRows);
  const persistence = loadTs<typeof import("../src/lib/db/gbp.ts")>("src/lib/db/gbp.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/encrypted-token": await import("../src/lib/encrypted-token.ts"),
  });
  const input = {
    userId: "11111111-1111-4111-8111-111111111111",
    accessToken: "new-access",
    refreshToken: "new-refresh",
    expiresAt: "2026-10-03T13:00:00.000Z",
    scope: "business.manage",
  };

  await persistence.upsertGbpConnection(input);
  const firstUpsert = db.calls[0];
  await persistence.upsertGbpConnection({ ...input, accessToken: "replacement-access" });
  const oauthUpsert = db.calls[1]!;
  assert.match(firstUpsert.query, /connection_version/);
  assert.match(firstUpsert.query, /gen_random_uuid\(\)/);
  assert.match(firstUpsert.query, /connection_version\s*=\s*EXCLUDED\.connection_version/);
  assert.match(oauthUpsert.query, /connection_version/);
  assert.match(oauthUpsert.query, /gen_random_uuid\(\)/);
  assert.match(oauthUpsert.query, /connection_version\s*=\s*EXCLUDED\.connection_version/);
  assert.deepEqual(decryptToken(String(firstUpsert.values[1])).value, input.accessToken);
  assert.deepEqual(decryptToken(String(firstUpsert.values[2])).value, input.refreshToken);
  assert.deepEqual(decryptToken(String(oauthUpsert.values[1])).value, "replacement-access");

  assert.match(oauthUpsert.query, /ON CONFLICT\s*\(user_id\)\s*DO UPDATE/);

  await persistence.updateGbpTokens({ ...input, accessToken: "rotated-access", refreshToken: "rotated-refresh" });
  const tokenRefresh = db.calls[2];
  assert.match(tokenRefresh.query, /UPDATE public\.gbp_connections/);
  assert.doesNotMatch(tokenRefresh.query, /connection_version/);
  assert.deepEqual(decryptToken(String(tokenRefresh.values[0])).value, "rotated-access");
  assert.deepEqual(decryptToken(String(tokenRefresh.values[1])).value, "rotated-refresh");

  const expected = {
    ...input,
    expectedConnectionVersion: "22222222-2222-4222-8222-222222222222",
    expectedEncryptedAccessToken: String(oauthUpsert.values[1]),
    expectedEncryptedRefreshToken: String(oauthUpsert.values[2]),
    accessToken: "cas-access",
    refreshToken: "cas-refresh",
  };
  resultRows = [{ user_id: input.userId }];
  assert.equal(await persistence.updateGbpTokensIfCurrent(expected), true);
  const conditionalWrite = db.calls[3]!;
  assert.match(conditionalWrite.query, /connection_version\s*=\s*\$\d+/);
  assert.match(conditionalWrite.query, /access_token\s*=\s*\$\d+/);
  assert.match(conditionalWrite.query, /refresh_token\s*=\s*\$\d+/);
  assert.match(conditionalWrite.query, /RETURNING user_id/);
  const setClause = conditionalWrite.query.split(/\bWHERE\b/i, 1)[0] ?? "";
  assert.doesNotMatch(setClause, /connection_version\s*=/);
  assert.equal(conditionalWrite.values.includes(expected.expectedConnectionVersion), true);
  assert.equal(conditionalWrite.values.includes(expected.expectedEncryptedAccessToken), true);
  assert.equal(conditionalWrite.values.includes(expected.expectedEncryptedRefreshToken), true);
  assert.deepEqual(decryptToken(String(conditionalWrite.values[0])).value, "cas-access");
  assert.deepEqual(decryptToken(String(conditionalWrite.values[1])).value, "cas-refresh");

  resultRows = [];
  assert.equal(await persistence.updateGbpTokensIfCurrent(expected), false);
});
