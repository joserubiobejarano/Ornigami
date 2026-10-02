import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/auth-verification";
import { getServerAppUrl } from "@/lib/env";
import { authCallback, requestIp } from "@/lib/auth-recovery-input";
import { checkPublicWriteRateLimit } from "@/lib/public-write-limiter";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
function redirect(url: URL) {
  return NextResponse.redirect(url, {
    headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
  });
}
export async function GET(request: Request) {
  let verified = false;
  let callbackUrl = "/dashboard";
  try {
    const params = new URL(request.url).searchParams;
    const token = params.get("token")?.trim() ?? "";
    callbackUrl = authCallback(params.get("callbackUrl"));
    if (TOKEN.test(token)) {
      const digest = createHash("sha256").update(token).digest("hex");
      const ipLimit = await checkPublicWriteRateLimit(`auth:verify:ip:${requestIp(request) ?? "unknown"}`, 30, 900);
      const tokenLimit = ipLimit && await checkPublicWriteRateLimit(`auth:verify:token:${digest}`, 5, 900);
      if (tokenLimit) {
        const result = await verifyEmailToken(token);
        verified = result.ok;
        if (result.ok || result.callbackUrl !== null) callbackUrl = authCallback(result.callbackUrl);
      }
    }
  } catch {
    safeLogger.error("auth.verify_email.failed", { error: "internal_error" });
  }
  const target = new URL("/login", getServerAppUrl());
  target.searchParams.set("verified", verified ? "1" : "0");
  target.searchParams.set("callbackUrl", callbackUrl);
  return redirect(target);
}
