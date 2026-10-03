export const DEFAULT_DASHBOARD_PAGE_SIZE = 50;
export const MAX_DASHBOARD_PAGE_SIZE = 100;

export type DashboardPageCursor = {
  scope: string;
  timestamp: string | null;
  id: string;
};

export type DashboardPage = {
  nextCursor: string | null;
  hasMore: boolean;
};

export function parseDashboardPageSize(value: string | null): number | null {
  if (value === null) return DEFAULT_DASHBOARD_PAGE_SIZE;
  if (!/^\d{1,3}$/.test(value)) return null;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1) return null;
  return Math.min(size, MAX_DASHBOARD_PAGE_SIZE);
}

/** Cursors are opaque, validated keyset positions bound to a business and optional location. */
export function encodeDashboardCursor(cursor: DashboardPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeDashboardCursor(
  value: string | null,
  expectedScope: string,
  options: { idType?: "bigint" | "uuid"; timestampNullable?: boolean } = {}
): DashboardPageCursor | null {
  if (value === null) return null;
  if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid pagination cursor.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid pagination cursor.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid pagination cursor.");
  const candidate = parsed as Record<string, unknown>;
  const isBigint = typeof candidate.id === "string" && /^(?:[1-9]\d{0,18})$/.test(candidate.id);
  const isUuid = typeof candidate.id === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.id);
  if (candidate.scope !== expectedScope
    || !(candidate.timestamp === null || typeof candidate.timestamp === "string")
    || (candidate.timestamp === null && options.timestampNullable === false)
    || typeof candidate.id !== "string"
    || (options.idType === "bigint" ? !isBigint : options.idType === "uuid" ? !isUuid : !isBigint && !isUuid)) {
    throw new Error("Invalid pagination cursor.");
  }
  if (candidate.timestamp !== null) {
    const timestamp = candidate.timestamp;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/i.exec(timestamp);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    const day = Number(match?.[3]);
    const hour = Number(match?.[4]);
    const minute = Number(match?.[5]);
    const second = Number(match?.[6]);
    const offsetHour = Number(match?.[9] ?? 0);
    const offsetMinute = Number(match?.[10] ?? 0);
    const validCalendarDate = Boolean(match)
      && year >= 1
      && month >= 1 && month <= 12
      && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
      && hour <= 23 && minute <= 59 && second <= 59
      && offsetHour <= 15 && offsetMinute <= 59;
    const validTimestamp = validCalendarDate && Boolean(match);
    if (timestamp.length > 64 || !validTimestamp) {
      throw new Error("Invalid pagination cursor.");
    }
  }
  if (isBigint && BigInt(candidate.id as string) > BigInt("9223372036854775807")) {
    throw new Error("Invalid pagination cursor.");
  }
  // Require canonical base64url to reject permissive decoder variants.
  const normalized = Buffer.from(JSON.stringify(candidate), "utf8").toString("base64url");
  if (normalized !== value) throw new Error("Invalid pagination cursor.");
  return { scope: expectedScope, timestamp: candidate.timestamp as string | null, id: candidate.id };
}

export function createDashboardPage<T extends { cursorId: string | number; cursorTimestamp: string | null }>(
  rows: T[],
  limit: number,
  scope: string
): { items: Omit<T, "cursorId" | "cursorTimestamp">[]; page: DashboardPage } {
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  const items = visible.map((row) => {
    const { cursorId, cursorTimestamp, ...item } = row;
    void cursorId;
    void cursorTimestamp;
    return item;
  });
  return {
    items,
    page: {
      hasMore,
      nextCursor: hasMore && last
        ? encodeDashboardCursor({ scope, timestamp: last.cursorTimestamp, id: String(last.cursorId) })
        : null,
    },
  };
}
