import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing credentials. Please pass an 'apiKey', or set the 'OPENAI_API_KEY' environment variable.");
    }
    client = new OpenAI({
      apiKey,
    });
  }
  return client;
}

// Re-export for lazy initialization at runtime only
export { getClient };

type BaseInput = {
  businessName: string;
  city: string;
  service: string;
  tone: string;
};

export async function generateBlog(input: BaseInput) {
  const system =
    "You are an expert local SEO writer. Produce helpful, unique, locally relevant content in clean Markdown with H2/H3 headings, bullets where useful, and a short CTA at the end. No keyword stuffing.";
  const user = `Business: ${input.businessName}
City: ${input.city}
Service: ${input.service}
Tone: ${input.tone}

Write an 800â€“1200 word blog post targeting local search intent with 3â€“5 specific local references (neighborhoods, landmarks, seasonal events). Include practical tips and avoid fluff. Output Markdown only.`;

  const res = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return res.choices[0]?.message?.content ?? "";
}

export async function generateGBPPost(input: BaseInput) {
  const system =
    "You are a GBP content specialist. Write concise, engaging posts for Google Business Profile that feel local and useful. Output Markdown only, no hashtags.";
  const user = `Business: ${input.businessName}
City: ${input.city}
Service: ${input.service}
Tone: ${input.tone}

Write a 120â€“200 word GBP post announcing value for local customers (offer, tip, event, update). Include a clear CTA ("Call us", "Book now"). Output Markdown only.`;

  const res = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return res.choices[0]?.message?.content ?? "";
}

export async function generateFAQs(input: BaseInput) {
  const system =
    "You craft concise, helpful FAQs for local service businesses. Output Markdown with H3 for each question and a short paragraph answer. Avoid generic filler.";
  const user = `Business: ${input.businessName}
City: ${input.city}
Service: ${input.service}
Tone: ${input.tone}

Write 6â€“10 FAQs customers in ${input.city} often ask about ${input.service}. Make them locally relevant. Output Markdown only.`;

  const res = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return res.choices[0]?.message?.content ?? "";
}

export type ReviewReplyInput = {
  businessName: string;
  city: string;
  rating: number;
  text: string;
  tone: string;
  ownerName?: string;
  teamName?: string;
  contactPreference?: string;
};

const REVIEW_REPLY_SYSTEM = `You write Google Business Profile owner replies. The output should feel like a short, natural reply from a local business owner , not an email, support ticket, or corporate response.

STYLE TARGET
- Local business owner; short Google review reply; natural and believable.
- Warm, calm, professional but not robotic. Do not sound corporate, exaggerated, or AI-like.

GENERAL RULES
- Reply like a real small-business owner or manager.
- Keep the response concise.
- Positive replies (4â€“5 stars): usually 1â€“3 sentences.
- Negative replies (1â€“2 stars): usually 2â€“4 sentences.
- Mixed/3-star replies: usually 2â€“4 sentences; acknowledge both positive and negative when relevant.
- Mention one real detail from the review when possible.
- Do not use emojis.
- Do not use placeholders such as [Reviewer's Name], [Your Name], [Business Name], or [contact info].
- Do not invent names, policies, refunds, promises, or facts not provided.
- Do not say "your feedback motivates us" or similar clichÃ© phrases unless truly natural.
- Avoid repetitive openings like "Thank you so much for your kind words."
- Avoid making every reply sound the same. Vary phrasing.

POSITIVE REVIEW RULES (4â€“5 stars)
- Thank the customer naturally.
- Reference something specific from the review.
- End simply. Do not overdo enthusiasm.

NEGATIVE REVIEW RULES (1â€“2 stars)
- Acknowledge the issue calmly.
- Apologize when appropriate. Do not be defensive.
- Do not over-explain.
- If no contact details are provided in context, you may say something neutral like: "Please contact us directly so we can look into this."
- Do not output fake signatures.

MIXED / 3-STAR RULES
- Acknowledge both positive and negative parts when relevant.
- Sound balanced, not overly apologetic.

OUTPUT: Plain text only. No markdown. No signatures unless a real name is provided in the instructions.`;

function buildReviewReplyUserMessage(input: ReviewReplyInput): string {
  const lines: string[] = [
    `Review rating: ${input.rating} stars`,
    `Review text: ${input.text}`,
  ];
  if (input.businessName) lines.push(`Business name: ${input.businessName}`);
  if (input.city) lines.push(`City/area: ${input.city}`);
  lines.push(`Tone: ${input.tone}`);
  if (input.ownerName) lines.push(`Owner/responder name (use only if it fits naturally): ${input.ownerName}`);
  if (input.teamName) lines.push(`Team name (use only if it fits naturally): ${input.teamName}`);
  if (input.contactPreference) lines.push(`Contact preference for customers: ${input.contactPreference}`);
  lines.push("");
  lines.push("Write one short reply. Output plain text only. Do not use any placeholders or signatures unless a real name was provided above.");
  return lines.join("\n");
}

/** Remove placeholder tokens and signature lines that the model may still output. Keeps the reply natural. */
export function sanitizeReviewReply(reply: string): string {
  let out = reply.trim();
  const placeholders = [
    /\[\s*Reviewer'?s?\s*Name\s*\]/gi,
    /\[\s*Your\s*Name\s*\]/gi,
    /\[\s*Business\s*Name\s*\]/gi,
    /\[\s*contact\s*info\s*\]/gi,
  ];
  for (const p of placeholders) {
    out = out.replace(p, "");
  }
  // Remove common sign-off lines (at end of reply) so we don't leave "Best," or "Sincerely," with nothing after
  out = out.replace(/\n?\s*(Best|Sincerely|Kind regards|Warm regards|Thank you),?\s*$/im, "");
  out = out.replace(/\n{2,}/g, "\n").trim();
  return out;
}

export async function generateReviewReply(input: ReviewReplyInput): Promise<string> {
  const user = buildReviewReplyUserMessage(input);
  const res = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: REVIEW_REPLY_SYSTEM },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  return sanitizeReviewReply(raw);
}

export type ProfileAuditInput = {
  mode: "connected" | "quick";
  businessName?: string | null;
  city?: string | null;
  category?: string | null;
  urlOrName?: string | null;
  gbpData?: any | null; // raw row from gbp_locations when available
};

export async function generateProfileAudit(input: ProfileAuditInput): Promise<string> {
  const system =
    "You are an expert local SEO and Google Business Profile consultant. You analyze local businesses and give very practical, actionable recommendations.";

  const contextJson = JSON.stringify(input, null, 2);

  let userMessage = `Context:\n${contextJson}\n\n`;

  if (input.mode === "connected") {
    userMessage += `Mode: connected\n`;
    if (input.gbpData) {
      userMessage += `The gbpData object contains columns from gbp_locations table (name, address, categories, rating, etc.). Use this data to provide specific, data-driven recommendations.\n\n`;
    }
  } else {
    userMessage += `Mode: quick\n`;
    userMessage += `We only know the URL or name, city, and category. Infer and generalize recommendations based on best practices for this type of business.\n\n`;
  }

  userMessage += `Analyze this business profile and return markdown only with the following sections:\n\n`;
  userMessage += `## Overview\n`;
  userMessage += `2â€“3 sentences summarizing the current state.\n\n`;
  userMessage += `## Quick score (0â€“100)\n`;
  userMessage += `A single line like: Score: 78/100\n\n`;
  userMessage += `## Priority fixes (next 7 days)\n`;
  userMessage += `Bullet list of the most critical issues to address.\n\n`;
  userMessage += `## Suggested GBP name\n`;
  userMessage += `1â€“2 SEO-friendly variants of the business name.\n\n`;
  userMessage += `## Suggested description\n`;
  userMessage += `Around 600â€“800 characters of an optimized business description.\n\n`;
  userMessage += `## Post ideas\n`;
  userMessage += `5â€“8 post ideas with titles and one-line angles.\n\n`;
  userMessage += `## Image recommendations\n`;
  userMessage += `4â€“6 concrete image ideas that would improve the profile.\n\n`;
  userMessage += `Output Markdown only.`;

  const res = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
  });

  return res.choices[0]?.message?.content ?? "";
}


