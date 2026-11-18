import { NextResponse } from "next/server";

import { buildAdvertorialPreview } from "@/lib/campaign-lab/advertorial";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { buildBrowserOfferCatalog } from "@/lib/campaign-lab/browser-offer";
import { parseBrowserOfferBriefRequest } from "@/lib/campaign-lab/browser-offer-brief";
import {
  createFormValues,
  isFixtureId,
} from "@/lib/campaign-lab/fixtures";
import {
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "@/lib/campaign-lab/generation/harness";
import { readBoundedJsonBody } from "@/lib/campaign-lab/generation/request-body";
import { runCampaignGeneration } from "@/lib/campaign-lab/generation/service";
import { loadCampaignCatalog } from "@/lib/campaign-lab/pilots/local-pilot";
import type { CampaignFormValues } from "@/lib/campaign-lab/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_768;
const BODY_KEYS = new Set(["fixtureId", "values", "browserBrief", "requestId"]);

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
  if (record.format !== undefined && record.format !== "offer" && record.format !== "advertorial") {
    return null;
  }
  if (
    record.advertorialLayout !== undefined &&
    record.advertorialLayout !== "auto" &&
    record.advertorialLayout !== "advertorial-full" &&
    record.advertorialLayout !== "advertorial-one-photo"
  ) {
    return null;
  }
  return {
    brandId: record.brandId as CampaignFormValues["brandId"],
    accent: record.accent as string,
    productName: record.productName as string,
    audience: record.audience as string | undefined,
    objective: record.objective as string | undefined,
    offer: record.offer as string,
    destinationUrl: record.destinationUrl as string,
    assetId: record.assetId as string,
    openingFocus: record.openingFocus,
    format: record.format as CampaignFormValues["format"],
    advertorialLayout: record.advertorialLayout as CampaignFormValues["advertorialLayout"],
  };
}

export async function POST(request: Request) {
  if (!isCampaignLabAvailable()) {
    return json({ ok: false, message: "Campaign Lab is unavailable." }, 404);
  }

  const bounded = await readBoundedJsonBody(request, MAX_BODY_BYTES);
  if (!bounded.ok) {
    return json({ ok: false, message: bounded.message }, bounded.status);
  }

  const body = bounded.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, message: "Send a JSON object." }, 400);
  }

  const record = body as Record<string, unknown>;
  const requestId = typeof record.requestId === "string"
    ? record.requestId.slice(0, 120)
    : undefined;

  const unsupported = Object.keys(record).filter((key) => !BODY_KEYS.has(key));
  if (unsupported.length > 0) {
    return json(
      {
        ok: false,
        message: `Unsupported request field "${unsupported[0]}".`,
        requestId,
      },
      400,
    );
  }

  if (record.browserBrief !== undefined) {
    if (record.fixtureId !== undefined || record.values !== undefined) {
      return json(
        {
          ok: false,
          message:
            "browserBrief cannot be combined with fixtureId or values; the server builds the browser brief context.",
          requestId,
        },
        400,
      );
    }
    const parsed = parseBrowserOfferBriefRequest(record.browserBrief);
    if (!parsed.ok) {
      return json({ ok: false, issues: parsed.issues, requestId }, 422);
    }
    try {
      const built = buildBrowserOfferCatalog(parsed.input);
      const values = createFormValues(built.fixture, built.catalog);
      if (parsed.accent) values.accent = parsed.accent;
      const result = await runCampaignGeneration(
        { fixtureId: built.fixture.id, values, requestId },
        { catalog: built.catalog },
      );
      return json(
        {
          ...result,
          requestId,
          browserBrief: parsed.context,
        },
        result.ok ? 200 : 422,
      );
    } catch {
      return json(
        {
          ok: false,
          message: "The browser brief could not be generated.",
          requestId,
        },
        500,
      );
    }
  }

  const fixtureId = record.fixtureId;
  const catalog = loadCampaignCatalog();
  if (typeof fixtureId !== "string" || !isFixtureId(fixtureId, catalog)) {
    return json({ ok: false, message: "Choose a supported campaign fixture." }, 400);
  }

  const values = readFormValues(record.values);
  if (!values) {
    return json({ ok: false, message: "The campaign form values are incomplete." }, 400);
  }

  try {
    const fixture = catalog.fixtures[fixtureId];
    const format = values.format ?? (fixture?.brief.advertorial ? "advertorial" : "offer");
    if (fixture && format === "advertorial") {
      const result = buildAdvertorialPreview(fixture, values, catalog);
      if (!result.ok) {
        return json({ ok: false, issues: result.issues, requestId }, 422);
      }
      return json(
        {
          ok: true,
          preview: result.preview,
          generation: {
            status: "fallback",
            provider: "deterministic",
            providerLabel: "Deterministic builder",
            providerMode: "none",
            harnessVersion: DESIGN_HARNESS_VERSION,
            guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
            code: "unavailable",
            message: "Advertorial drafts are assembled deterministically from approved brief material. Live model generation is out of scope.",
          },
          requestId,
        },
        200,
      );
    }
    const result = await runCampaignGeneration({ fixtureId, values, requestId }, { catalog });
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
