import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { InvalidJsonBodyError, parseJsonBody } from "@/server/lib/http";
import {
  BusinessNotFoundError,
  submitLeadForm,
} from "@/server/services/form-submission.service";
import { ChannelConfigurationError } from "@/server/services/channel-policy.service";
import { submitFormSchema } from "@/server/validators/forms";
import { getTrustedRequestIp } from "@/server/lib/request-ip";
import { safeLogger } from "@/lib/safe-logger";

export async function POST(req: Request) {
  try {
    const input = await parseJsonBody(req, submitFormSchema);
    const ipAddress = getTrustedRequestIp(req.headers);
    const userAgent = req.headers.get("user-agent");

    const result = await submitLeadForm(input, {
      ipAddress,
      userAgent,
    });

    if (!result.accepted && result.blockedReason === "rate_limited") {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many form submissions from this source. Please try again shortly.",
          data: result,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds ?? 60),
          },
        },
      );
    }

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
          error: "Invalid payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    if (error instanceof BusinessNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Business not found.",
        },
        { status: 404 },
      );
    }

    if (error instanceof ChannelConfigurationError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 422 },
      );
    }

    safeLogger.error("forms.submit.failed", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to process form submission.",
      },
      { status: 500 },
    );
  }
}
