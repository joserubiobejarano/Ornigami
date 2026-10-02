import { NextResponse } from "next/server";
import { safeLogger } from "@/lib/safe-logger";
import { ZodError } from "zod";

import { decodeUrlEncodedBody } from "@/server/lib/http";
import {
  TwilioSignatureError,
  verifyTwilioRequestSignature,
} from "@/server/lib/twilio-webhook";
import {
  BusinessInboundAddressNotFoundError,
  ingestTwilioInbound,
  InvalidInboundIdentityError,
} from "@/server/services/lead-intake.service";
import { InboundLatencyTracker } from "@/server/services/inbound-latency-tracker.service";
import { resolveBusinessByInboundAddress } from "@/server/db/repositories/businesses.repo";
import { twilioInboundSchema } from "@/server/validators/twilio";

export async function POST(req: Request) {
  let latencyTracker: InboundLatencyTracker | null = null;
  let completedLatency = false;
  try {
    const rawBody = await req.text();
    const formFields = decodeUrlEncodedBody(rawBody);
    verifyTwilioRequestSignature({
      request: req,
      formFields,
    });

    const input = twilioInboundSchema.parse(formFields);
    const inboundTraceId =
      (typeof input.MessageSid === "string" && input.MessageSid.trim().length > 0
        ? input.MessageSid.trim()
        : `twilio-inbound-${crypto.randomUUID()}`);
    latencyTracker = new InboundLatencyTracker(inboundTraceId);
    latencyTracker.attachContext({
      inboundMessageId: input.MessageSid ?? null,
    });
    latencyTracker.mark("inbound_request_received", 0, {
      channel:
        typeof input.From === "string" && input.From.startsWith("whatsapp:")
          ? "whatsapp"
          : "sms",
    });

    const businessResolution = await latencyTracker.timeStage(
      "business_lookup",
      async () => resolveBusinessByInboundAddress(input.To),
    );
    latencyTracker.attachContext({
      businessId: businessResolution.business?.id ?? null,
    });
    console.debug("Twilio inbound business resolution.", {
      to: input.To,
      normalizedInboundDestination: businessResolution.normalizedInboundAddress,
      matchedBusinessId: businessResolution.business?.id ?? null,
      matchedBusinessSlug: businessResolution.business?.slug ?? null,
      matchedBusinessName: businessResolution.business?.name ?? null,
      matchedBusinessAddress: businessResolution.matchedBusinessAddress,
    });

    await ingestTwilioInbound(input, formFields, businessResolution, latencyTracker);
    latencyTracker.complete();
    completedLatency = true;

    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid Twilio inbound payload.",
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

    if (
      error instanceof BusinessInboundAddressNotFoundError ||
      error instanceof InvalidInboundIdentityError
    ) {
      safeLogger.warn("twilio.inbound.ignored", {
        reason: error.name,
        normalizedInboundDestination:
          error instanceof BusinessInboundAddressNotFoundError
            ? error.normalizedInboundAddress
            : null,
      });
      return new NextResponse("<Response></Response>", {
        status: 200,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
        },
      });
    }

      safeLogger.error("twilio.inbound.failed", { error: error instanceof Error ? error.message : "unknown" });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to process Twilio inbound webhook.",
      },
      { status: 500 },
    );
  } finally {
    if (latencyTracker && !completedLatency) {
      latencyTracker.complete();
    }
  }
}
