import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationAttempt } from "../src/lib/campaign-lab/generation/generation-attempt.ts";

test("a new attempt gets a unique HTTP key while local ordering stays separate", () => {
  const first = createGenerationAttempt(1);
  const remounted = createGenerationAttempt(1);
  const later = createGenerationAttempt(2);

  assert.equal(first.localSequence, 1);
  assert.equal(remounted.localSequence, 1);
  assert.equal(later.localSequence, 2);
  assert.notEqual(first.idempotencyKey, remounted.idempotencyKey);
  assert.notEqual(remounted.idempotencyKey, later.idempotencyKey);
  assert.match(first.idempotencyKey, /^gen_[0-9a-f-]{36}$/i);
  assert.ok(Object.isFrozen(first));
});

test("many attempts do not collide and keep one stable key per attempt object", () => {
  const attempts = Array.from({ length: 200 }, (_, index) =>
    createGenerationAttempt(index + 1),
  );
  assert.equal(
    new Set(attempts.map((attempt) => attempt.idempotencyKey)).size,
    attempts.length,
  );
  const retryOfSameAttempt = { ...attempts[0] };
  assert.equal(
    retryOfSameAttempt.idempotencyKey,
    attempts[0].idempotencyKey,
    "reusing the attempt object must preserve its idempotency key",
  );
});

test("a generation attempt requires a positive local sequence", () => {
  assert.throws(() => createGenerationAttempt(0), /positive local sequence/);
  assert.throws(() => createGenerationAttempt(-1), /positive local sequence/);
  assert.throws(() => createGenerationAttempt(1.5), /positive local sequence/);
});
