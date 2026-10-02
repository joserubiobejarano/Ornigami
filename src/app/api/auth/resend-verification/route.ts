import { createAuthEmailRequestHandler } from "@/lib/auth-email-request";
export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = createAuthEmailRequestHandler("verification");
