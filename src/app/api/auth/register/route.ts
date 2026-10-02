import { after } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { createUserWithPassword, findUserByEmail } from "@/lib/db/users";
import { authEmailDeliveryAvailable, createEmailVerification } from "@/lib/auth-verification";
import { isValidAuthPassword } from "@/lib/auth-password-policy";
import { allowAuthWrite, authCallback, normalizeAuthEmail, readBoundedJson, requestIp } from "@/lib/auth-recovery-input";
import { authJson } from "@/lib/auth-response";
import { safeLogger } from "@/lib/safe-logger";
import { EmailSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 30;
const RegisterSchema = z.object({
  email: EmailSchema,
  password: z.unknown(),
  fullName: z.string().trim().min(1).max(200).optional(),
  callbackUrl: z.unknown().optional(),
});
const genericResponse = { ok: true, message: "If registration can be completed, a verification email will be sent." };

export async function POST(request: Request) {
  try {
    const parsed = RegisterSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
    const password = parsed.data.password;
    if (!isValidAuthPassword(password)) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
    const email = normalizeAuthEmail(parsed.data.email);
    if (!email) return authJson({ ok: false, error: "Invalid input" }, { status: 400 });
    if (!(await allowAuthWrite("register", email, requestIp(request)))) {
      return authJson({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
    }
    if (!authEmailDeliveryAvailable()) {
      return authJson({ ok: false, error: "Email delivery is temporarily unavailable. Try again later." }, { status: 503 });
    }
    // Pay the same bcrypt cost for existing and new email addresses.
    const passwordHash = await hash(password, 10);
    let created = null;
    if (!(await findUserByEmail(email))) {
      created = await createUserWithPassword({ email, passwordHash, fullName: parsed.data.fullName ?? null });
    }
    if (created) {
      const newUser = created;
      const callbackUrl = authCallback(parsed.data.callbackUrl);
      after(async () => {
        try {
          await createEmailVerification(email, newUser.id, callbackUrl);
        } catch {
          safeLogger.error("auth.register.verification_delivery_failed", { error: "internal_error" });
        }
      });
    }
    const response = authJson(genericResponse);
    response.cookies.set("ll_demo", "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    safeLogger.error("auth.register.post.failed", { error: "internal_error" });
    return authJson({ ok: false, error: "Server error" }, { status: 500 });
  }
}
