import { z } from "zod";

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Invalid JSON body.");
    this.name = "InvalidJsonBodyError";
  }
}

export function decodeUrlEncodedBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  return Object.fromEntries(params.entries());
}

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodSchema<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
  return schema.parse(body);
}

export async function parseUrlEncodedBody<T>(
  req: Request,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const raw = await req.text();
  const body = decodeUrlEncodedBody(raw);
  return schema.parse(body);
}
