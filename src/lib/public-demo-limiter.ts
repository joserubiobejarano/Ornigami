import { createHash } from "crypto";

type CounterBucket = {
  count: number;
  dayKey: string;
};

const buckets = new Map<string, CounterBucket>();

function getUtcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function checkAndIncrementPublicDemoLimit(key: string, maxPerDay: number): boolean {
  const dayKey = getUtcDayKey();
  const prev = buckets.get(key);

  if (!prev || prev.dayKey !== dayKey) {
    buckets.set(key, { count: 1, dayKey });
    return true;
  }

  if (prev.count >= maxPerDay) {
    return false;
  }

  prev.count += 1;
  buckets.set(key, prev);
  return true;
}

export function getRequestIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  return null;
}
