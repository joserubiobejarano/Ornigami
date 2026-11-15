#!/usr/bin/env node
/**
 * Evidence runner for the Campaign Lab server generation path.
 *
 * It posts the same form values the editor sends and reports whether the
 * response preserved campaign identity and used approved facts. Run it against
 * a local dev server configured for success, invalid, or timeout mode.
 *
 * Usage:
 *   node --experimental-strip-types scripts/campaign-lab-generation-check.mjs \
 *     --url http://localhost:3100 --fixture sparse --expect generated
 *   node --experimental-strip-types scripts/campaign-lab-generation-check.mjs \
 *     --url http://localhost:3100 --pilot momisa --opening mask-night --expect generated
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  CAMPAIGN_FIXTURES,
  createFormValues,
  getAsset,
} from "../src/lib/campaign-lab/fixtures.ts";

const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://localhost:3100" },
    fixture: { type: "string", short: "f" },
    pilot: { type: "string", short: "p" },
    "pilot-dir": { type: "string", default: ".local/campaign-lab-pilots" },
    opening: { type: "string" },
    expect: { type: "string", short: "e", default: "generated" },
    "expect-code": { type: "string" },
  },
});

function loadPilot(pilotId) {
  const manifestPath = path.resolve(cli["pilot-dir"], pilotId, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Pilot manifest not found: ${manifestPath}. Run npm run campaign-lab:pilot:load first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const asset = manifest.assets?.[0];
  const opening = manifest.fixture?.openings?.[0];
  if (!asset || !manifest.fixture?.brief || !manifest.brand) {
    throw new Error(`Pilot manifest is incomplete: ${manifestPath}`);
  }
  const fixture = {
    id: manifest.fixture.id,
    label: manifest.fixture.label,
    description: manifest.fixture.description,
    assetId: asset.id,
    openings: manifest.fixture.openings,
    brief: {
      ...manifest.fixture.brief,
      fixtureId: manifest.fixture.id,
      brandId: manifest.brand.id,
      assetId: asset.id,
      copy: manifest.fixture.brief.copy ?? opening?.copy,
    },
  };
  const values = {
    brandId: manifest.brand.id,
    accent: manifest.brand.tokens.accent,
    productName: manifest.fixture.brief.productName,
    offer: manifest.fixture.brief.offer,
    destinationUrl: manifest.fixture.brief.destinationUrl,
    assetId: asset.id,
    openingFocus: opening?.id,
  };
  return { manifest, fixture, asset, values };
}

async function main() {
  const pilot = cli.pilot ? loadPilot(cli.pilot) : null;
  const fixture = pilot?.fixture ?? CAMPAIGN_FIXTURES[cli.fixture ?? "sparse"];
  if (!fixture) {
    console.error(`Unknown fixture "${cli.fixture}". Use sparse, long-copy, or --pilot <id>.`);
    return 2;
  }

  const values = pilot?.values ?? createFormValues(fixture);
  if (cli.opening) {
    if (!fixture.openings?.some((opening) => opening.id === cli.opening)) {
      console.error(`Unknown opening "${cli.opening}". Available: ${fixture.openings?.map((opening) => opening.id).join(", ")}`);
      return 2;
    }
    values.openingFocus = cli.opening;
    const selected = fixture.openings.find((opening) => opening.id === cli.opening);
    if (selected) {
      values.productName = fixture.brief.productName;
      values.offer = fixture.brief.offer;
      values.destinationUrl = fixture.brief.destinationUrl;
    }
  }

  const url = new URL("/api/campaign-lab/generate", cli.url);
  const requestId = `evidence-${randomUUID()}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId: fixture.id,
        values,
        requestId,
      }),
    });
  } catch (error) {
    console.error(`Could not reach ${url}: ${error.message}`);
    return 2;
  }

  const payload = await response.json().catch(() => null);
  const checks = [];
  const check = (name, passed, observed, expected) => {
    checks.push({ name, passed, observed, expected });
  };

  check("http-status", response.status === 200, response.status, 200);
  check("response-ok", payload?.ok === true, payload?.ok, true);
  check("request-echo", payload?.requestId === requestId, payload?.requestId, requestId);
  check(
    "generation-status",
    payload?.generation?.status === cli.expect,
    payload?.generation?.status,
    cli.expect,
  );
  if (cli["expect-code"]) {
    check(
      "generation-code",
      payload?.generation?.code === cli["expect-code"],
      payload?.generation?.code,
      cli["expect-code"],
    );
  }

  const preview = payload?.preview;
  const brief = preview?.brief;
  const draft = preview?.draft;
  const asset = preview?.asset;
  const approvedAsset = pilot?.asset ?? getAsset(values.assetId);

  check("product-identity-preserved", brief?.productName === values.productName, brief?.productName, values.productName);
  check("offer-preserved", brief?.offer === values.offer, brief?.offer, values.offer);
  check("destination-preserved", brief?.destinationUrl === values.destinationUrl, brief?.destinationUrl, values.destinationUrl);
  check("asset-id-preserved", asset?.id === values.assetId, asset?.id, values.assetId);
  check("alt-text-preserved", asset?.alt === approvedAsset?.alt, asset?.alt, approvedAsset?.alt);

  const approvedIds = new Set(fixture.brief.productFacts.map((fact) => fact.id));
  const selectedIds = (draft?.facts ?? []).map((fact) => fact.id);
  check(
    "facts-are-approved",
    selectedIds.every((id) => approvedIds.has(id)),
    selectedIds,
    [...approvedIds],
  );
  check(
    "facts-have-approved-source-text",
    (draft?.facts ?? []).every((fact) => typeof fact.source?.quote === "string" && fact.source.quote.length > 0),
    (draft?.facts ?? []).map((fact) => fact.source?.quote),
    "non-empty approved quotes",
  );
  check(
    "sections-valid",
    Array.isArray(draft?.sections) && draft.sections[0] === "hero" && draft.sections.at(-1) === "close",
    draft?.sections,
    "starts with hero and ends with close",
  );
  check("revision-present", typeof preview?.revision === "string" && preview.revision.length > 0, preview?.revision, "revision hash");

  const failed = checks.filter((item) => !item.passed);
  const report = {
    target: url.href,
    pilot: pilot ? pilot.manifest.pilot : null,
    fixture: fixture.id,
    openingFocus: values.openingFocus ?? null,
    requestId,
    status: failed.length === 0 ? "passed" : "failed",
    generation: payload?.generation ?? null,
    revision: preview?.revision ?? null,
    draft: draft
      ? {
          layout: draft.layout,
          sections: draft.sections,
          headline: draft.headline,
          factIds: selectedIds,
        }
      : null,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
