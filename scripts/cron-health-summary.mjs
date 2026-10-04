import { pathToFileURL } from 'node:url';

const jobs = new Set(['review_booster', 'review_replies', 'privacy_retention']);
const reasons = new Set(['never_run', 'missed_schedule', 'stale_running', 'partial', 'failed']);
const statuses = new Set(['running', 'succeeded', 'partial', 'failed', 'no_work']);

/** Print only allowlisted health diagnostics, never the complete endpoint body. */
export function summarizeCronHealth(body) {
  if (!body || body.ok !== true || typeof body.healthy !== 'boolean' || body.monitoring?.ok !== true
    || !Array.isArray(body.alerts) || !Array.isArray(body.jobs) || body.alerts.length > 15 || body.jobs.length > 3) {
    return { healthy: false, error: 'invalid_health_response' };
  }
  const alerts = body.alerts.map((row) => ({
    job: jobs.has(row?.job_name) ? row.job_name : 'unknown',
    reason: reasons.has(row?.reason) ? row.reason : 'unknown',
    transportFailed: Number.isInteger(row?.transport_failures) && row.transport_failures > 0,
  }));
  return { healthy: body.healthy === true && alerts.length === 0, alerts,
    jobs: body.jobs.map((row) => ({ job: jobs.has(row?.job_name) ? row.job_name : 'unknown',
      status: statuses.has(row?.status) ? row.status : 'unknown' })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let source = ''; let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 64_000) throw new Error('oversize');
      source += chunk.toString('utf8');
    }
    const result = summarizeCronHealth(JSON.parse(source));
    console.log(JSON.stringify(result));
    if (!result.healthy) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ healthy: false, error: 'invalid_health_response' }));
    process.exitCode = 1;
  }
}
