import OpenAI from "openai";

type EmailInput = {
  business_name: string;
  business_type?: string | null;
  city?: string | null;
  customer_name?: string | null;
  service_name?: string | null;
  google_review_url: string;
  tone_setting?: string | null;
  language?: string | null;
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function normalizeEmailBodyPunctuation(body: string): string {
  return body.replace(/[—–]/g, "-");
}

export function buildSubject(businessName: string) {
  return `Thank you for visiting ${businessName}`;
}

export function buildFallbackEmailBody(input: EmailInput) {
  const customerName = input.customer_name || "there";
  const serviceName = input.service_name ? ` for ${input.service_name}` : "";

  return [
    `Hi ${customerName},`,
    "",
    `Thank you so much for visiting ${input.business_name}${serviceName} yesterday. We truly appreciate your trust and support.`,
    "If you had a great experience, we would be grateful if you could leave a quick Google review.",
    "",
    "Warmly,",
    input.business_name
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateFollowupEmailBody(input: EmailInput) {
  if (!openai) {
    return buildFallbackEmailBody(input);
  }

  const prompt = `You are a warm assistant for ${input.business_name}, a ${input.business_type || "local business"} in ${input.city || "their city"}.
Write a short, friendly follow-up email to ${input.customer_name || "the customer"} who visited yesterday for ${input.service_name || "a service"}.

Include:
- A genuine thank-you, maximum 2 sentences
- A subtle ask to leave a Google review using a short CTA sentence like "Leave your review"
- Keep it warm, simple, and not pushy
- Max 120 words
- No subject line
- Do not include raw URLs in the email body
- Never use em dashes or en dashes (no "—" or "–"). Use commas, periods, or a simple hyphen "-" instead.

Tone: ${input.tone_setting || "warm and friendly"}
Language: ${input.language || "en"}

Return only the email body.`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const body = normalizeEmailBodyPunctuation((response.output_text || "").trim());
    if (!body) return buildFallbackEmailBody(input);
    return body;
  } catch {
    return buildFallbackEmailBody(input);
  }
}
