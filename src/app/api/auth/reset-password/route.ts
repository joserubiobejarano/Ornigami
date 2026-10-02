import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { consumePasswordReset } from "@/lib/auth-verification";
import { isValidAuthPassword } from "@/lib/auth-password-policy";
import { authCallback, readBoundedJson, requestIp } from "@/lib/auth-recovery-input";
import { authJson } from "@/lib/auth-response";
import { checkPublicWriteRateLimit } from "@/lib/public-write-limiter";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
const ResetSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.unknown() });

export async function POST(request: Request) {
  try {
    const parsed = ResetSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
    const password = parsed.data.password;
    if (!isValidAuthPassword(password)) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
    const tokenDigest = createHash("sha256").update(parsed.data.token).digest("hex");
    const [ipAllowed, tokenAllowed] = await Promise.all([
      checkPublicWriteRateLimit(`auth:reset-password:ip:${requestIp(request) ?? "unknown"}`, 20, 900),
      checkPublicWriteRateLimit(`auth:reset-password:token:${tokenDigest}`, 5, 900),
    ]);
    if (!ipAllowed || !tokenAllowed) {
      return authJson({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
    }
    const passwordHash = await hash(password, 10);
    const result = await consumePasswordReset(parsed.data.token, passwordHash);
    if (!result.ok) {
      const body: Record<string, unknown> = { ok: false, error: "This recovery link is invalid or expired. Request a new one." };
      if (result.callbackUrl) body.callbackUrl = authCallback(result.callbackUrl);
      return authJson(body, { status: 400 });
    }
    return authJson({ ok: true, message: "Password updated.", callbackUrl: authCallback(result.callbackUrl) });
  } catch {
    safeLogger.error("auth.reset_password.failed", { error: "internal_error" });
    return authJson({ ok: false, error: "Server error" }, { status: 500 });
  }
}
