export function percentile(values, fraction = 0.5, precision = 2) {
  if (!Array.isArray(values) || values.length === 0 || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return Number(sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)].toFixed(precision));
}

export function summarize(values, precision = 2) {
  const usable = values.filter(Number.isFinite);
  if (!Number.isInteger(precision) || precision < 0 || precision > 8) throw new Error("summary precision must be an integer from 0 through 8");
  const roundedPercentile = percentile(usable, 0.5, precision);
  return { n: usable.length, p50: roundedPercentile === null ? null : Number(roundedPercentile.toFixed(precision)),
    max: usable.length ? Number(Math.max(...usable).toFixed(precision)) : null };
}

export function maxClsSessionWindow(shifts) {
  const entries = shifts.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.startTime))
    .filter((entry) => !entry.hadRecentInput).sort((a, b) => a.startTime - b.startTime);
  let best = { value: 0, startTime: null, endTime: null };
  let session = [];
  let value = 0;
  for (const entry of entries) {
    const previous = session.at(-1);
    if (previous && (entry.startTime - previous.startTime >= 1000 || entry.startTime - session[0].startTime >= 5000)) {
      session = [];
      value = 0;
    }
    session.push(entry);
    value += entry.value;
    if (value > best.value) best = { value: Number(value.toFixed(5)), startTime: session[0].startTime, endTime: entry.startTime };
  }
  return best;
}

export function summarizeApiCalls(calls) {
  const apiCalls = calls.filter((call) => call.pathname.startsWith('/api/'));
  const counts = {};
  for (const call of apiCalls) {
    const key = `${call.method} ${call.pathname}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { total: apiCalls.length, duplicates: Object.entries(counts).filter(([, count]) => count > 1).map(([key, count]) => ({ request: key, count })) };
}
