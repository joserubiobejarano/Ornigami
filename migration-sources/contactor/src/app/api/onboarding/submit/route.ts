import { NextResponse } from "next/server";
import { safeLogger } from "@/lib/safe-logger";
import { ZodError } from "zod";

import { submitOnboardingRequest } from "@/server/services/onboarding.service";
import { submitOnboardingSchema } from "@/server/validators/onboarding";

export async function POST(req: Request) {
  try {
    const rawBody = await readJsonBody(req);
    const input = submitOnboardingSchema.parse(rawBody);

    const result = await submitOnboardingRequest(input, {
      rawPayload: isPlainObject(rawBody) ? rawBody : null,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Request body must be valid JSON.",
        },
        { status: 400 },
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid onboarding payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    safeLogger.error("onboarding.submit.failed", { error: error instanceof Error ? error.message : "unknown" });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to submit onboarding request.",
      },
      { status: 500 },
    );
  }
}

class InvalidJsonBodyError extends Error {
  constructor() {
    super("Invalid JSON body.");
    this.name = "InvalidJsonBodyError";
  }
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
