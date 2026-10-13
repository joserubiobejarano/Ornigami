export function nearestRankPercentile(values, percentile = 0.95) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("percentile values must be a non-empty array of finite non-negative numbers");
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new RangeError("percentile must be greater than 0 and at most 1");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) throw new TypeError("samples must be non-empty");
  const durations = samples.map((sample) => sample.durationMs);
  return {
    count: samples.length,
    p50Ms: nearestRankPercentile(durations, 0.5),
    p95Ms: nearestRankPercentile(durations, 0.95),
    maxMs: Math.max(...durations),
  };
}

export function assessSamples(samples, { minimum = 30, latencyLimitMs = 3000 } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) throw new TypeError("samples must be non-empty");
  const summary = summarizeSamples(samples);
  const slow = samples.filter((sample) => sample.durationMs > latencyLimitMs).length;
  const errors = samples.filter((sample) => sample.ok !== true).length;
  return { ...summary, slowCount: slow, errorCount: errors,
    pass: samples.length >= minimum && summary.p95Ms <= latencyLimitMs && errors === 0 };
}
