import { createHash } from "node:crypto";

import { sql } from "@/lib/db/neon";

export async function checkPublicWriteRateLimit(key: string, maxHits: number, windowSeconds = 600): Promise<boolean> {
  const keyHash = createHash("sha256").update(key).digest("hex");
  const rows = await sql`
    INSERT INTO public.api_rate_limits (key_hash, window_started_at, hits)
    VALUES (${keyHash}, now(), 1)
    ON CONFLICT (key_hash) DO UPDATE SET
      hits = CASE
        WHEN public.api_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second') THEN 1
        ELSE public.api_rate_limits.hits + 1
      END,
      window_started_at = CASE
        WHEN public.api_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second') THEN now()
        ELSE public.api_rate_limits.window_started_at
      END,
      updated_at = now()
    RETURNING hits
  `;
  return Number((rows[0] as { hits?: number } | undefined)?.hits ?? maxHits + 1) <= maxHits;
}
