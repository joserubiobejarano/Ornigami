import OpenAI from "openai";
import { getRequiredEnv } from "@/lib/env";

let client: OpenAI | null = null;

export const OPENAI_MODEL = "gpt-4o-mini";
export const OPENAI_REQUEST_TIMEOUT_MS = 20_000;
export const OPENAI_MAX_RETRIES = 2;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = getRequiredEnv("OPENAI_API_KEY");
    client = new OpenAI({
      apiKey,
      timeout: OPENAI_REQUEST_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES,
    });
  }
  return client;
}

// Re-export for lazy initialization at runtime only
export { getClient };

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

const REVIEW_REPLY_SYSTEM = `You write Google Business Profile owner replies. The output should feel like a short, natural reply from a local business owner — not an email, support ticket, or corporate response.

STYLE TARGET
- Local business owner; short Google review reply; natural and believable.
- Warm, calm, professional but not robotic. Do not sound corporate, exaggerated, or AI-like.

GENERAL RULES
- Reply like a real small-business owner or manager.
- Keep the response concise.
- Positive replies (4–5 stars): usually 1–3 sentences.
- Negative replies (1–2 stars): usually 2–4 sentences.
- Mixed/3-star replies: usually 2–4 sentences; acknowledge both positive and negative when relevant.
- Mention one real detail from the review when possible.
- Do not use emojis.
- Do not use placeholders such as [Reviewer's Name], [Your Name], [Business Name], or [contact info].
- Do not invent names, policies, refunds, promises, or facts not provided.
- Do not say "your feedback motivates us" or similar cliché phrases unless truly natural.
- Avoid repetitive openings like "Thank you so much for your kind words."
- Avoid making every reply sound the same. Vary phrasing.

POSITIVE REVIEW RULES (4–5 stars)
- Thank the customer naturally.
- Reference something specific from the review.
- End simply. Do not overdo enthusiasm.

NEGATIVE REVIEW RULES (1–2 stars)
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
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: REVIEW_REPLY_SYSTEM },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  return sanitizeReviewReply(raw);
}

export async function streamReviewReply(input: ReviewReplyInput) {
  const user = buildReviewReplyUserMessage(input);
  return getClient().chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: REVIEW_REPLY_SYSTEM }, { role: "user", content: user }],
    stream: true,
  });
}

export type ProfileAuditInput = {
  mode: "connected" | "quick";
  businessName?: string | null;
  city?: string | null;
  category?: string | null;
  urlOrName?: string | null;
  gbpData?: Record<string, unknown> | null; // raw row from gbp_locations when available
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
  userMessage += `2–3 sentences summarizing the current state.\n\n`;
  userMessage += `## Quick score (0–100)\n`;
  userMessage += `A single line like: Score: 78/100\n\n`;
  userMessage += `## Priority fixes (next 7 days)\n`;
  userMessage += `Bullet list of the most critical issues to address.\n\n`;
  userMessage += `## Suggested GBP name\n`;
  userMessage += `1–2 SEO-friendly variants of the business name.\n\n`;
  userMessage += `## Suggested description\n`;
  userMessage += `Around 600–800 characters of an optimized business description.\n\n`;
  userMessage += `## Post ideas\n`;
  userMessage += `5–8 post ideas with titles and one-line angles.\n\n`;
  userMessage += `## Image recommendations\n`;
  userMessage += `4–6 concrete image ideas that would improve the profile.\n\n`;
  userMessage += `Output Markdown only.`;

  const res = await getClient().chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
  });

  return res.choices[0]?.message?.content ?? "";
}

