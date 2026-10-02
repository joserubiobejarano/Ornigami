export const PAST_DUE_GRACE_DAYS = 7;

export function isWithinPastDueGracePeriod(currentPeriodEnd: string | null | undefined, now = Date.now()): boolean {
  if (!currentPeriodEnd) return false;
  const periodEnd = new Date(currentPeriodEnd).getTime();
  if (!Number.isFinite(periodEnd)) return false;
  return now <= periodEnd + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export function hasActiveBusinessEntitlement(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now = Date.now()
): boolean {
  if (status === "active" || status === "trialing") return true;
  return status === "past_due" && isWithinPastDueGracePeriod(currentPeriodEnd, now);
}
