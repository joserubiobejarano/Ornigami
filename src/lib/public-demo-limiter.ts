import { createHash } from "crypto";
import { sql } from "@/lib/db/neon";

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

export async function checkAndIncrementPublicDemoLimitDurable(params: {
  keyType: "email" | "ip";
  keyHash: string;
  maxPerDay: number;
}): Promise<boolean> {
  const rows = await sql`
    INSERT INTO public.public_demo_events (event_date, key_type, key_hash, count)
    VALUES (CURRENT_DATE, ${params.keyType}, ${params.keyHash}, 1)
    ON CONFLICT (event_date, key_type, key_hash)
    DO UPDATE SET count = public.public_demo_events.count + 1, updated_at = now()
    RETURNING count
  `;
  const count = Number((rows[0] as { count?: number } | undefined)?.count ?? 0);
  return count <= params.maxPerDay;
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
