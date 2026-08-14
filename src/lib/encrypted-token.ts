import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getOptionalEnv } from "./env.ts";

const PREFIX = "v1";

function encryptionKey(): Buffer {
  const configured = getOptionalEnv("TOKEN_ENCRYPTION_KEY") || getOptionalEnv("AUTH_SECRET") || getOptionalEnv("NEXTAUTH_SECRET");
  if (!configured && getOptionalEnv("NODE_ENV") === "production") {
    throw new Error("TOKEN_ENCRYPTION_KEY (or AUTH_SECRET) is required in production.");
  }
  return createHash("sha256").update(configured || "local-dev-token-encryption-key").digest();
}

export function encryptToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptToken(value: string): { value: string; legacy: boolean } {
  if (!value.startsWith(`${PREFIX}:`)) return { value, legacy: true };
  const [, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(":");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return { value: plaintext, legacy: false };
}
