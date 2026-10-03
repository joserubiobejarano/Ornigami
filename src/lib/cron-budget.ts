/** Small app-side budget helpers. Database statement timeouts remain database-owned. */
export function millisecondsRemaining(deadlineAt: Date, now = Date.now()): number {
  return Math.max(0, deadlineAt.getTime() - now);
}

/** Reserve time for checkpoint/finish writes and admit provider work only with a bounded window. */
export function providerWindow(deadlineAt: Date, options: { maxMs?: number; reserveMs?: number } = {}): number | null {
  const reserveMs = options.reserveMs ?? 5_000;
  const available = millisecondsRemaining(deadlineAt) - reserveMs;
  if (available < 1_000) return null;
  return Math.max(1_000, Math.min(options.maxMs ?? 8_000, available));
}

export function isCronBudgetExpired(deadlineAt: Date, now = Date.now()): boolean {
  return millisecondsRemaining(deadlineAt, now) <= 0;
}
