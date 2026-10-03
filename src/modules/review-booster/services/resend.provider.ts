import { buildUnsubscribeUrl } from "@/modules/review-booster/services/unsubscribe-token.service";
import { isSafeBookingUrl, isSafeGoogleReviewUrl, isSafeSenderName } from "@/modules/review-booster/services/settings-link-validation";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";

export type ResendEmailPayload = {
  from: string;
  to: string | string[];
  reply_to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
};

export type DeliveryFailureKind = "definite_rejection" | "ambiguous";

export class ResendDeliveryError extends Error {
  readonly kind: DeliveryFailureKind;
  readonly status?: number;
  constructor(message: string, kind: DeliveryFailureKind, status?: number) {
    super(message);
    this.name = "ResendDeliveryError";
    this.kind = kind;
    this.status = status;
  }
}

export function isResendDeliveryError(error: unknown): error is ResendDeliveryError {
  if (error instanceof ResendDeliveryError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; kind?: unknown; status?: unknown };
  return candidate.name === "ResendDeliveryError" &&
    (candidate.kind === "definite_rejection" || candidate.kind === "ambiguous") &&
    (candidate.status === undefined || typeof candidate.status === "number");
}

export function classifyResendFailure(error: unknown): DeliveryFailureKind {
  return isResendDeliveryError(error) ? error.kind : "ambiguous";
}

type PrepareEmailInput = {
  business_id?: string | null;
  email_from_name?: string | null;
  business_name: string;
  customer_email: string;
  subject: string;
  body: string;
  google_review_url: string;
  rebooking_url?: string | null;
  review_link_url?: string | null;
  reply_to_email?: string | null;
  language?: string | null;
  cta_label?: string;
  unsubscribe_label?: string;
  unsubscribe_description?: string;
  delivery_id?: string;
};

const copy: Record<string, { cta: string; bookAgain: string; unsubscribe: string; description: string }> = {
  en: { cta: "Leave your review", bookAgain: "Book again", unsubscribe: "Unsubscribe", description: "Don't want future follow-up emails?" },
  es: { cta: "Deja tu opinión", bookAgain: "Reserva de nuevo", unsubscribe: "Darse de baja", description: "¿No quieres recibir más correos de seguimiento?" },
  fr: { cta: "Laisser un avis", bookAgain: "Réserver à nouveau", unsubscribe: "Se désabonner", description: "Vous ne souhaitez plus recevoir d'e-mails de suivi ?" },
  de: { cta: "Bewertung abgeben", bookAgain: "Erneut buchen", unsubscribe: "Abmelden", description: "Möchten Sie keine weiteren Folgenachrichten erhalten?" },
  it: { cta: "Lascia una recensione", bookAgain: "Prenota di nuovo", unsubscribe: "Annulla l'iscrizione", description: "Non vuoi più ricevere email di follow-up?" },
  pt: { cta: "Deixe sua avaliação", bookAgain: "Agende novamente", unsubscribe: "Cancelar inscrição", description: "Não quer receber mais emails de acompanhamento?" },
};

function languageCode(language?: string | null): string {
  const normalized = (language || "en").trim().replaceAll("_", "-").split("-")[0].toLowerCase();
  return copy[normalized] ? normalized : "en";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function safeHttpUrl(value: string): string {
  try {
    if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error("control character");
    const url = new URL(value);
    const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && localHost))) throw new Error("unsafe URL");
    return value;
  } catch {
    throw new ResendDeliveryError("Invalid email link URL", "definite_rejection");
  }
}

function senderHeaderName(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new ResendDeliveryError("Invalid sender display name", "definite_rejection");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Builds the complete provider request before delivery so callers can persist this exact JSON for replay. */
export async function prepareResendPayload(input: PrepareEmailInput): Promise<ResendEmailPayload> {
  const emailFrom = getRequiredEnv("EMAIL_FROM");
  const replyToEmail = getOptionalEnv("REPLY_TO_EMAIL");
  if (!isSafeGoogleReviewUrl(input.google_review_url)) {
    throw new ResendDeliveryError("Invalid Google review destination", "definite_rejection");
  }
  const reviewLinkUrl = safeHttpUrl((input.review_link_url || input.google_review_url || "").trim());
  const rebookingUrl = input.rebooking_url && isSafeBookingUrl(input.rebooking_url.trim())
    ? input.rebooking_url.trim()
    : null;
  const unsubscribeUrl = input.business_id
    ? safeHttpUrl(await buildUnsubscribeUrl({ businessId: input.business_id, customerEmail: input.customer_email }))
    : null;
  const localized = copy[languageCode(input.language)];
  const cta = input.cta_label || localized.cta;
  const bookAgain = localized.bookAgain;
  const unsubscribe = input.unsubscribe_label || localized.unsubscribe;
  const unsubscribeDescription = input.unsubscribe_description || localized.description;
  const safeBody = escapeHtml(input.body).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
  const htmlBooking = rebookingUrl ? `<p style="margin-top: 12px;"><a href="${escapeHtml(rebookingUrl)}" style="color:#5b21b6;">${escapeHtml(bookAgain)}</a></p>` : "";
  const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;"><p>${safeBody}</p><p style="margin-top: 16px;"><a href="${escapeHtml(reviewLinkUrl)}" style="display:inline-block;background:#6d28d6;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">${escapeHtml(cta)}</a></p>${htmlBooking}${unsubscribeUrl ? `<p style="margin-top: 18px; font-size: 12px; color: #64748b;">${escapeHtml(unsubscribeDescription)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#334155;">${escapeHtml(unsubscribe)}</a>.</p>` : ""}</div>`;
  const textBooking = rebookingUrl ? `\n\n${bookAgain}: ${rebookingUrl}` : "";
  const textUnsubscribe = unsubscribeUrl ? `\n\n${unsubscribeDescription} ${unsubscribe}: ${unsubscribeUrl}` : "";
  const senderName = input.email_from_name && isSafeSenderName(input.email_from_name)
    ? input.email_from_name
    : input.business_name;
  const payload: ResendEmailPayload = {
    from: `${senderHeaderName(senderName)} <${emailFrom}>`,
    to: input.customer_email,
    reply_to: input.reply_to_email || replyToEmail || emailFrom,
    subject: input.subject,
    text: `${input.body}\n\n${cta}: ${reviewLinkUrl}${textBooking}${textUnsubscribe}`,
    html,
    ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    ...(input.delivery_id ? { tags: [{ name: "ornigami_delivery_id", value: input.delivery_id }] } : {}),
  };
  if (payload.headers) Object.freeze(payload.headers);
  return Object.freeze(payload);
}

/** Sends only the caller's frozen JSON payload; it never rebuilds email content. */
export async function sendPreparedWithResend(payload: ResendEmailPayload, idempotencyKey: string): Promise<string> {
  if (!idempotencyKey || idempotencyKey.length > 256) {
    throw new ResendDeliveryError("Invalid Resend idempotency key", "definite_rejection");
  }
  let apiKey: string;
  try {
    apiKey = getRequiredEnv("RESEND_API_KEY");
  } catch (error) {
    throw new ResendDeliveryError(error instanceof Error ? error.message : "Missing Resend API key", "definite_rejection");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    throw new ResendDeliveryError(error instanceof Error ? error.message : "Resend transport failed", "ambiguous");
  }
  try {
    let data: unknown;
    try { data = await response.json(); } catch {
      throw new ResendDeliveryError("Resend returned an unreadable response", response.ok || response.status >= 500 || response.status === 409 ? "ambiguous" : "definite_rejection", response.status);
    }
    const record = data && typeof data === "object" ? data as { id?: unknown; message?: unknown } : {};
    if (!response.ok) {
      const kind = response.status === 409 || response.status >= 500 || response.status < 400
        ? "ambiguous"
        : "definite_rejection";
      throw new ResendDeliveryError(typeof record.message === "string" ? record.message : `Resend request failed (${response.status})`, kind, response.status);
    }
    if (typeof record.id !== "string" || !record.id.trim()) {
      throw new ResendDeliveryError("Resend accepted the request but returned no message ID", "ambiguous", response.status);
    }
    return record.id;
  } finally {
    clearTimeout(timer);
  }
}

/** Compatibility entry point; durable/retryable delivery must use prepare + sendPrepared separately. */
export async function sendWithResend(input: PrepareEmailInput): Promise<string> {
  const payload = await prepareResendPayload(input);
  return sendPreparedWithResend(payload, crypto.randomUUID());
}
