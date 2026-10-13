const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;

export function normalizePermissionAt(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string" || !ISO_WITH_OFFSET.test(value.trim())) return null;
  const input = value.trim();
  const clock = /T(\d{2}):(\d{2}):(\d{2})/.exec(input);
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3]) > 59) return null;
  const datePortion = input.slice(0, 10);
  const calendarDate = new Date(`${datePortion}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePortion) return null;
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) && timestamp <= now ? new Date(timestamp).toISOString() : null;
}

export function normalizePermissionEvidence(input: {
  source: unknown;
  at: unknown;
  noticeVersion: unknown;
  recipientEmail: string | null;
}, now = Date.now()): { source: string; at: string; noticeVersion: string; recipientEmail: string } | null {
  if (!input.recipientEmail) return null;
  const source = typeof input.source === "string" ? input.source.trim() : "";
  const noticeVersion = typeof input.noticeVersion === "string" ? input.noticeVersion.trim() : "";
  const at = normalizePermissionAt(input.at, now);
  if (!source || source.length > 120 || /[\u0000-\u001f\u007f]/.test(source)
    || !noticeVersion || noticeVersion.length > 80 || /[\u0000-\u001f\u007f]/.test(noticeVersion) || !at) return null;
  return { source, at, noticeVersion, recipientEmail: input.recipientEmail.trim().toLowerCase() };
}

/** Date-only input is interpreted as midnight UTC. Datetimes must carry Z or an explicit offset. */
export function normalizeVisitedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  const dateOnly = DATE_ONLY.exec(input);
  if (dateOnly) {
    const date = new Date(`${input}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input) return null;
    return date.toISOString();
  }
  if (!ISO_WITH_OFFSET.test(input)) return null;
  const datePortion = input.slice(0, 10);
  const date = DATE_ONLY.exec(datePortion);
  if (!date) return null;
  const calendarDate = new Date(`${datePortion}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePortion) return null;
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function isValidCustomerEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCustomerPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return phone.length <= 32 && digits.length >= 5 && /^[+\d(][\d\s().-]*$/.test(phone);
}
