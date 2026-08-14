import { timingSafeEqual } from "node:crypto";
import { getOptionalEnv } from "@/lib/env";

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = getOptionalEnv("CRON_SECRET");
  const received = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return expectedBuffer.length > 0 &&
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer);
}
