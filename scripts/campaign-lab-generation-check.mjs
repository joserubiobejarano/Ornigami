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
 *     --url http://127.0.0.1:3100 --fixture sparse --expect generated
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import {
  CAMPAIGN_FIXTURES,
  createFormValues,
  getAsset,
} from "../src/lib/campaign-lab/fixtures.ts";

const { values: cli } = parseArgs({
  options: {
    url: { type: "string", short: "u", default: "http://127.0.0.1:3100" },
    fixture: { type: "string", short: "f", default: "sparse" },
    expect: { type: "string", short: "e", default: "generated" },
    "expect-code": { type: "string" },
  },
});

async function main() {
  const fixture = CAMPAIGN_FIXTURES[cli.fixture];
  if (!fixture) {
    console.error(`Unknown fixture "${cli.fixture}". Use sparse or long-copy.`);
    return 2;
  }

  const formValues = createFormValues(fixture);
  const url = new URL("/api/campaign-lab/generate", cli.url);
  const requestId = `evidence-${randomUUID()}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId: fixture.id,
        values: formValues,
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
  const approvedAsset = getAsset(formValues.assetId);

  check("product-identity-preserved", brief?.productName === formValues.productName, brief?.productName, formValues.productName);
  check("offer-preserved", brief?.offer === formValues.offer, brief?.offer, formValues.offer);
  check("destination-preserved", brief?.destinationUrl === formValues.destinationUrl, brief?.destinationUrl, formValues.destinationUrl);
  check("asset-id-preserved", asset?.id === formValues.assetId, asset?.id, formValues.assetId);
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
    fixture: fixture.id,
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
