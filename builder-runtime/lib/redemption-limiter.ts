import { createHash } from "node:crypto";

/**
 * Per-process invitation-redemption attempt bound. This is abuse friction, not
 * a durable audit record; a process restart resets the window. The supported
 * builder topology is one runtime process (plus operator CLI) on one host.
 */
type AttemptBucket = {
  windowStart: number;
  count: number;
};

const buckets = new Map<string, AttemptBucket>();
const GLOBAL_KEY = "global";
const MAX_BUCKETS = 4_096;
const MAX_CLIENT_KEY_LENGTH = 64;
const IPV4_OR_IPV6 = /^[0-9a-fA-F:.\[\]]+$/;

export type RedemptionAttemptDecision =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

function hashed(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

/**
 * Derives a bounded client key. Forwarded headers are considered only when
 * `trustProxyHeaders` is explicitly enabled; the intended edge proxy must
 * overwrite them so a client cannot choose its own bucket.
 */
export function redemptionClientKey(
  request: Request,
  trustProxyHeaders: boolean,
): string {
  let address = "direct";
  if (trustProxyHeaders) {
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",", 1)[0]
      ?.trim();
    const real = request.headers.get("x-real-ip")?.trim();
    const candidate = forwarded || real;
    if (
      candidate &&
      candidate.length <= MAX_CLIENT_KEY_LENGTH &&
      IPV4_OR_IPV6.test(candidate)
    ) {
      address = candidate;
    }
  }
  return hashed(address);
}

function bucketFor(key: string, now: number, windowMs: number): AttemptBucket {
  const existing = buckets.get(key);
  if (existing && now - existing.windowStart < windowMs) return existing;
  const fresh = { windowStart: now, count: 0 };
  buckets.set(key, fresh);
  return fresh;
}

function retryAfterSeconds(
  bucket: AttemptBucket,
  now: number,
  windowMs: number,
): number {
  return Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
}

export function consumeRedemptionAttempt(input: {
  clientKey: string;
  windowSeconds: number;
  clientLimit: number;
  globalLimit: number;
  now?: number;
}): RedemptionAttemptDecision {
  const now = input.now ?? Date.now();
  const windowMs = input.windowSeconds * 1000;

  if (buckets.size > MAX_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= windowMs) buckets.delete(key);
    }
  }

  const client = bucketFor(input.clientKey, now, windowMs);
  const global = bucketFor(GLOBAL_KEY, now, windowMs);

  if (client.count >= input.clientLimit) {
    return {
      ok: false,
      retryAfterSeconds: retryAfterSeconds(client, now, windowMs),
    };
  }
  if (global.count >= input.globalLimit) {
    return {
      ok: false,
      retryAfterSeconds: retryAfterSeconds(global, now, windowMs),
    };
  }

  client.count += 1;
  global.count += 1;
  return { ok: true };
}

/** Test seam: the server process naturally resets these on restart. */
export function resetRedemptionAttempts(): void {
  buckets.clear();
}
