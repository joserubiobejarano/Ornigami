import "server-only";

export const OPENAI_UNAVAILABLE_CODE = "AI_UNAVAILABLE";
export const OPENAI_UNAVAILABLE_MESSAGE = "AI features are currently unavailable.";

/** Paid API features stay off unless an operator opts in with the exact value `true`. */
export function isOpenAIEnabled(): boolean {
  return process.env.OPENAI_ENABLED === "true";
}
