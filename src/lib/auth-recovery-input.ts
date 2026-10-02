import { createHash } from "node:crypto";
import { checkPublicWriteRateLimit } from "@/lib/public-write-limiter";
import { sanitizeAuthReturnPath } from "@/lib/auth-return-path";
import { getTrustedRequestIp } from "@/lib/trusted-request-ip";
import { EmailSchema } from "@/lib/validators";

const MAX_BODY_BYTES = 8_192;
export async function readBoundedJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
  finally { try { reader.releaseLock(); } catch { /* already released */ } }
}
export function normalizeAuthEmail(value: unknown): string | null {
  const parsed = EmailSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}
export function authCallback(value: unknown): string { return sanitizeAuthReturnPath(value, "/dashboard"); }
export function requestIp(request: Request): string | null { return getTrustedRequestIp(request.headers); }
export async function allowAuthWrite(kind: string, email: string, ip: string | null): Promise<boolean> {
  const digest = createHash("sha256").update(email).digest("hex");
  const [ipOk, emailOk] = await Promise.all([
    checkPublicWriteRateLimit(`auth:${kind}:ip:${ip ?? "unknown"}`, 20, 900),
    checkPublicWriteRateLimit(`auth:${kind}:email:${digest}`, 5, 900),
  ]);
  return ipOk && emailOk;
}
