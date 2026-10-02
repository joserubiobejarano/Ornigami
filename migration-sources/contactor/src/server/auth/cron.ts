import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
