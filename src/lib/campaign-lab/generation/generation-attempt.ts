/**
 * A local attempt number and the HTTP idempotency key are separate contracts.
 * The local number only orders responses for this mounted editor; the key is
 * globally unique so a reload, remount or second tab starts a new attempt.
 * Reuse `idempotencyKey` only when retrying the same attempt.
 */
export type GenerationAttempt = Readonly<{
  localSequence: number;
  idempotencyKey: string;
}>;

function browserUuid(): string | null {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  return null;
}

function fallbackUuid(): string {
  // Older browsers without randomUUID still need a random key.
  const bytes = new Uint8Array(16);
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObject?.getRandomValues === "function") {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createGenerationAttempt(localSequence: number): GenerationAttempt {
  if (!Number.isInteger(localSequence) || localSequence < 1) {
    throw new Error("A generation attempt needs a positive local sequence.");
  }
  return Object.freeze({
    localSequence,
    idempotencyKey: `gen_${browserUuid() ?? fallbackUuid()}`,
  });
}
