import OpenAI from "openai";

export const OPENAI_MODEL = "gpt-4o-mini";
export const OPENAI_REQUEST_TIMEOUT_MS = 20_000;
export const OPENAI_MAX_RETRIES = 2;

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}
