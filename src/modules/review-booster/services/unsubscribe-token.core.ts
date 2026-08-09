import { createHmac, timingSafeEqual } from "node:crypto";

export type UnsubscribeTokenPayload = { businessId: string; customerEmail: string };

function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }
function sign(value: string, secret: string): string { return createHmac("sha256", secret).update(value).digest("hex"); }

export function buildCoreUnsubscribeToken(payload: UnsubscribeTokenPayload, secret: string): string {
  const encoded = encode(JSON.stringify({ businessId: payload.businessId, customerEmail: payload.customerEmail.trim().toLowerCase() }));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyCoreUnsubscribeToken(token: string, secret: string): UnsubscribeTokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(decode(encoded)) as UnsubscribeTokenPayload;
    if (!parsed.businessId || !parsed.customerEmail) return null;
    return { businessId: parsed.businessId, customerEmail: parsed.customerEmail.trim().toLowerCase() };
  } catch { return null; }
}