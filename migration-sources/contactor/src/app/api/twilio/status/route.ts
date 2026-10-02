import { NextResponse } from "next/server";
import { safeLogger } from "@/lib/safe-logger";
import { ZodError } from "zod";

import { decodeUrlEncodedBody } from "@/server/lib/http";
import {
  TwilioSignatureError,
  verifyTwilioRequestSignature,
} from "@/server/lib/twilio-webhook";
import { processTwilioStatusCallback } from "@/server/services/twilio-status.service";
import { twilioStatusSchema } from "@/server/validators/twilio";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const formFields = decodeUrlEncodedBody(rawBody);
    verifyTwilioRequestSignature({
      request: req,
      formFields,
    });

    const input = twilioStatusSchema.parse(formFields);
    await processTwilioStatusCallback(input, formFields);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid Twilio status payload.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    if (error instanceof TwilioSignatureError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid Twilio signature.",
        },
        { status: 403 },
      );
    }

    safeLogger.error("twilio.status.failed", { error: error instanceof Error ? error.message : "unknown" });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to process Twilio status webhook.",
      },
      { status: 500 },
    );
  }
}
