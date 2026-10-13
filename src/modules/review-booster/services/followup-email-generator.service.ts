import OpenAI from "openai";
import { getOptionalEnv } from "@/lib/env";
import { isOpenAIEnabled } from "@/lib/openai-feature";

type EmailInput = {
  business_name: string;
  business_type?: string | null;
  city?: string | null;
  customer_name?: string | null;
  service_name?: string | null;
  google_review_url: string;
  tone_setting?: string | null;
  language?: string | null;
  visited_at?: string | Date | null;
};

let openai: OpenAI | null = null;

function getOpenAIClientIfEnabled(): OpenAI | null {
  if (!isOpenAIEnabled()) return null;
  if (openai) return openai;
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  if (!apiKey) return null;
  openai = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });
  return openai;
}

function isUnknownOpenAiOutcome(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown };
  return candidate.name === "APIConnectionError" || candidate.name === "APIConnectionTimeoutError" ||
    (typeof candidate.status === "number" && candidate.status >= 500);
}

const languageNames: Record<string, string> = { en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese" };
function languageCode(language?: string | null): string {
  const normalized = (language || "en").trim().replaceAll("_", "-").split("-")[0].toLowerCase();
  return languageNames[normalized] ? normalized : "en";
}

function normalizeEmailBodyPunctuation(body: string): string {
  return body.replace(/[—–]/g, "-");
}

export function buildSubject(businessName: string, language?: string | null) {
  const code = languageCode(language);
  const subjects: Record<string, (name: string) => string> = {
    en: (name) => `Thank you for visiting ${name}`,
    es: (name) => `Gracias por visitarnos en ${name}`,
    fr: (name) => `Merci de votre visite chez ${name}`,
    de: (name) => `Danke für Ihren Besuch bei ${name}`,
    it: (name) => `Grazie per aver visitato ${name}`,
    pt: (name) => `Obrigado por visitar ${name}`,
  };
  return subjects[code](businessName);
}

const timingCopy: Record<string, { today: string; yesterday: string; days: (n: number) => string; recent: string }> = {
  en: { today: "today", yesterday: "yesterday", days: (n) => `${n} days ago`, recent: "recently" },
  es: { today: "hoy", yesterday: "ayer", days: (n) => `hace ${n} días`, recent: "recientemente" },
  fr: { today: "aujourd'hui", yesterday: "hier", days: (n) => `il y a ${n} jours`, recent: "récemment" },
  de: { today: "heute", yesterday: "gestern", days: (n) => `vor ${n} Tagen`, recent: "vor Kurzem" },
  it: { today: "oggi", yesterday: "ieri", days: (n) => `${n} giorni fa`, recent: "di recente" },
  pt: { today: "hoje", yesterday: "ontem", days: (n) => `há ${n} dias`, recent: "recentemente" },
};

/** Uses UTC calendar dates (rather than elapsed 24-hour blocks) to describe a visit. */
export function visitTimingPhrase(visitedAt?: string | Date | null, now: Date = new Date(), language?: string | null): string {
  if (!visitedAt) return "";
  const timestamp = new Date(visitedAt).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const visitDate = new Date(timestamp);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const visitUtc = Date.UTC(visitDate.getUTCFullYear(), visitDate.getUTCMonth(), visitDate.getUTCDate());
  const daysAgo = Math.floor((todayUtc - visitUtc) / 86_400_000);
  const copy = timingCopy[languageCode(language)];
  if (daysAgo <= 0) return copy.today;
  if (daysAgo === 1) return copy.yesterday;
  if (daysAgo < 7) return copy.days(daysAgo);
  return copy.recent;
}

const bodyCopy: Record<string, { greeting: (name: string) => string; thank: (business: string, service: string, timing: string) => string; ask: string; signoff: string }> = {
  en: { greeting: (n) => n ? `Hi ${n},` : "Hi there,", thank: (b, s, t) => `Thank you so much for visiting ${b}${s}${t ? ` ${t}` : ""}. We truly appreciate your trust and support.`, ask: "You are welcome to share your experience in a Google review.", signoff: "Warmly," },
  es: { greeting: (n) => n ? `Hola ${n},` : "Hola,", thank: (b, s, t) => `Muchas gracias por visitar ${b}${s}${t ? ` ${t}` : ""}. Agradecemos mucho tu confianza y apoyo.`, ask: "Te invitamos a compartir tu experiencia en una reseña en Google.", signoff: "Un cordial saludo," },
  fr: { greeting: (n) => n ? `Bonjour ${n},` : "Bonjour,", thank: (b, s, t) => `Merci beaucoup d'avoir rendu visite à ${b}${s}${t ? ` ${t}` : ""}. Nous vous remercions de votre confiance.`, ask: "Nous vous invitons à partager votre expérience dans un avis Google.", signoff: "Bien à vous," },
  de: { greeting: (n) => n ? `Hallo ${n},` : "Guten Tag,", thank: (b, s, t) => `Vielen Dank für Ihren Besuch bei ${b}${s}${t ? ` ${t}` : ""}. Wir schätzen Ihr Vertrauen sehr.`, ask: "Teilen Sie gern Ihre Erfahrung in einer Google-Bewertung.", signoff: "Herzliche Grüße," },
  it: { greeting: (n) => n ? `Ciao ${n},` : "Ciao,", thank: (b, s, t) => `Grazie mille per aver visitato ${b}${s}${t ? ` ${t}` : ""}. Apprezziamo molto la tua fiducia e il tuo supporto.`, ask: "Ti invitiamo a condividere la tua esperienza in una recensione su Google.", signoff: "Un caro saluto," },
  pt: { greeting: (n) => n ? `Olá ${n},` : "Olá,", thank: (b, s, t) => `Muito obrigado por visitar ${b}${s}${t ? ` ${t}` : ""}. Agradecemos muito a sua confiança e apoio.`, ask: "Convidamos você a compartilhar sua experiência em uma avaliação no Google.", signoff: "Atenciosamente," },
};

export function buildFallbackEmailBody(input: EmailInput, now: Date = new Date()) {
  const code = languageCode(input.language);
  const copy = bodyCopy[code];
  const timing = visitTimingPhrase(input.visited_at, now, code);
  const customerName = input.customer_name?.trim() || "";
  // Legacy service details are deliberately excluded from generated email.
  const service = "";
  return [copy.greeting(customerName), "", copy.thank(input.business_name, service, timing), copy.ask, "", copy.signoff, input.business_name].join("\n");
}

export async function generateFollowupEmailBody(input: EmailInput, options: { timeoutMs?: number } = {}) {
  const openaiClient = getOpenAIClientIfEnabled();
  if (!openaiClient) return buildFallbackEmailBody(input);
  const code = languageCode(input.language);
  const prompt = `You are a warm assistant for ${input.business_name}, a ${input.business_type || "local business"} in ${input.city || "their city"}.
Write a short, friendly follow-up email in ${languageNames[code]} to ${input.customer_name || "the customer"} who visited ${visitTimingPhrase(input.visited_at, new Date(), code) || "at an unspecified time"}.

Include:
- A genuine thank-you, maximum 2 sentences
- A neutral invitation to share their experience in a Google review, regardless of satisfaction
- Never condition the request on a positive experience or ask for a positive rating
- Keep it warm, simple, and not pushy
- Max 120 words
- No subject line
- Do not include raw URLs in the email body
- Never use em dashes or en dashes (no "—" or "–"). Use commas, periods, or a simple hyphen "-" instead.

Tone: ${input.tone_setting || "warm and friendly"}

Return only the email body.`;
  try {
    const response = await openaiClient.responses.create(
      { model: "gpt-4.1-mini", input: prompt },
      options.timeoutMs ? { timeout: Math.max(1, Math.floor(options.timeoutMs)), maxRetries: 0 } : undefined,
    );
    const body = normalizeEmailBodyPunctuation((response.output_text || "").trim());
    return body || buildFallbackEmailBody(input);
  } catch (error) {
    if (isUnknownOpenAiOutcome(error)) {
      const unknown = new Error("OpenAI follow-up generation outcome is unknown.");
      unknown.name = "BoosterGenerationOutcomeUnknown";
      throw unknown;
    }
    return buildFallbackEmailBody(input);
  }
}
