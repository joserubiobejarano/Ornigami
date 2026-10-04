import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCronHealth } from '../scripts/cron-health-summary.mjs';

test('health monitor distinguishes healthy, missed schedules, and unavailable store without disclosing payloads', () => {
  const base = { ok: true, healthy: true, monitoring: { ok: true }, alerts: [],
    jobs: [{ job_name: 'review_booster', status: 'no_work', outcomes: { secret: 'private' } }] };
  assert.equal(summarizeCronHealth(base).healthy, true);
  const unhealthy = summarizeCronHealth({ ...base, healthy: false,
    alerts: [{ job_name: 'review_booster', reason: 'missed_schedule', transport_failures: 1,
      private_email: 'private@example.test', last_transport_error: 'private' }] });
  assert.deepEqual(unhealthy.alerts, [{ job: 'review_booster', reason: 'missed_schedule', transportFailed: true }]);
  assert.equal(unhealthy.healthy, false);
  assert.doesNotMatch(JSON.stringify(unhealthy), /private|email|outcomes/);
  assert.equal(summarizeCronHealth({ ...base, monitoring: { ok: false } }).error, 'invalid_health_response');
  assert.equal(summarizeCronHealth({ healthy: true }).healthy, false);
  const malformed = summarizeCronHealth({ ...base, alerts: [{ job_name: 'private', reason: 'private' }] });
  assert.equal(malformed.healthy, false);
  assert.doesNotMatch(JSON.stringify(malformed), /private/);
});
