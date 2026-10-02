import { after } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/db/users";
import { authEmailDeliveryAvailable, createEmailVerification, createPasswordReset } from "@/lib/auth-verification";
import { safeLogger } from "@/lib/safe-logger";
import { authJson } from "@/lib/auth-response";
import { allowAuthWrite, authCallback, normalizeAuthEmail, readBoundedJson, requestIp } from "@/lib/auth-recovery-input";
import { EmailSchema } from "@/lib/validators";

export type AuthEmailRequestKind = "verification" | "password-reset";
const RequestSchema = z.object({ email: EmailSchema, callbackUrl: z.unknown().optional() });
const PUBLIC_MESSAGES: Record<AuthEmailRequestKind, string> = {
  verification: "If an unverified account exists, a verification email will be sent.",
  "password-reset": "If an account can reset its password, a recovery email will be sent.",
};

export function createAuthEmailRequestHandler(kind: AuthEmailRequestKind) {
  return async function POST(request: Request) {
    try {
      const parsed = RequestSchema.safeParse(await readBoundedJson(request));
      if (!parsed.success) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
      const email = normalizeAuthEmail(parsed.data.email);
      if (!email) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
      if (!(await allowAuthWrite(kind, email, requestIp(request)))) {
        return authJson({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
      }
      if (!authEmailDeliveryAvailable()) {
        return authJson({ ok: false, error: "Email delivery is temporarily unavailable. Try again later." }, { status: 503 });
      }
      const callbackUrl = authCallback(parsed.data.callbackUrl);
      after(async () => {
        try {
          const user = await findUserByEmail(email);
          const shouldSend = kind === "verification"
            ? Boolean(user && !user.email_verified)
            : Boolean(user?.password_hash);
          if (!user || !shouldSend) return;
          if (kind === "verification") await createEmailVerification(email, user.id, callbackUrl);
          else await createPasswordReset(email, user.id, callbackUrl);
        } catch {
          safeLogger.error(`auth.${kind}.delivery_failed`, { error: "internal_error" });
        }
      });
      return authJson({ ok: true, message: PUBLIC_MESSAGES[kind] });
    } catch {
      safeLogger.error(`auth.${kind}.request_failed`, { error: "internal_error" });
      return authJson({ ok: false, error: "Server error" }, { status: 500 });
    }
  };
}
