import OpenAI from "openai";

type EmailInput = {
  business_name: string;
  business_type?: string | null;
  city?: string | null;
  customer_name?: string | null;
  service_name?: string | null;
  google_review_url: string;
  rebooking_url?: string | null;
  tone_setting?: string | null;
  language?: string | null;
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export function buildSubject(businessName: string) {
  return `Thank you for visiting ${businessName}`;
}

export function buildFallbackEmailBody(input: EmailInput) {
  const customerName = input.customer_name || "there";
  const serviceName = input.service_name ? ` for ${input.service_name}` : "";
  const rebookText = input.rebooking_url
    ? `If you would like to visit again, you can rebook here: ${input.rebooking_url}`
    : "";

  return [
    `Hi ${customerName},`,
    "",
    `Thank you so much for visiting ${input.business_name}${serviceName} yesterday. We truly appreciate your trust and support.`,
    `If you had a great experience, we would be grateful if you shared a quick Google review: ${input.google_review_url}`,
    rebookText,
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
- A subtle ask to leave a Google review using this link: ${input.google_review_url}
- A soft invite to rebook using this link if available: ${input.rebooking_url || "N/A"}
- Keep it warm, simple, and not pushy
- Max 120 words
- No subject line

Tone: ${input.tone_setting || "warm and friendly"}
Language: ${input.language || "en"}

Return only the email body.`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const body = (response.output_text || "").trim();
    if (!body) return buildFallbackEmailBody(input);
    return body;
  } catch {
    return buildFallbackEmailBody(input);
  }
}
