import { NextResponse } from "next/server";

import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { isFixtureId } from "@/lib/campaign-lab/fixtures";
import { runCampaignGeneration } from "@/lib/campaign-lab/generation/service";
import type { CampaignFormValues } from "@/lib/campaign-lab/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_768;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function readFormValues(raw: unknown): CampaignFormValues | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const fields = ["brandId", "accent", "productName", "offer", "destinationUrl", "assetId"] as const;
  if (fields.some((field) => typeof record[field] !== "string")) return null;
  if (record.openingFocus !== undefined && typeof record.openingFocus !== "string") return null;
  return {
    brandId: record.brandId as CampaignFormValues["brandId"],
    accent: record.accent as string,
    productName: record.productName as string,
    offer: record.offer as string,
    destinationUrl: record.destinationUrl as string,
    assetId: record.assetId as string,
    openingFocus: record.openingFocus,
  };
}

export async function POST(request: Request) {
  if (!isCampaignLabAvailable()) {
    return json({ ok: false, message: "Campaign Lab is unavailable." }, 404);
  }

  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, message: "The request body is too large." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Send a JSON request body." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, message: "Send a JSON object." }, 400);
  }

  const record = body as Record<string, unknown>;
  const fixtureId = record.fixtureId;
  if (typeof fixtureId !== "string" || !isFixtureId(fixtureId)) {
    return json({ ok: false, message: "Choose a supported campaign fixture." }, 400);
  }

  const values = readFormValues(record.values);
  if (!values) {
    return json({ ok: false, message: "The campaign form values are incomplete." }, 400);
  }

  const requestId = typeof record.requestId === "string"
    ? record.requestId.slice(0, 120)
    : undefined;

  try {
    const result = await runCampaignGeneration({ fixtureId, values, requestId });
    return json({ ...result, requestId }, result.ok ? 200 : 422);
  } catch {
    return json(
      {
        ok: false,
        message: "The preview could not be generated.",
        requestId,
      },
      500,
    );
  }
}
