#!/usr/bin/env node
/**
 * Evidence runner for the app-owned Campaign Lab design harness.
 *
 * It uses synthetic tracked fixtures, captures the exact object passed to the
 * generation provider for two materially different audiences/objectives, and
 * captures the OpenAI prompt that would be sent from those requests. No paid
 * provider is called. All captures stay under Git-ignored .local storage.
 *
 * Usage:
 *   node --experimental-strip-types scripts/campaign-lab-design-harness-check.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  CAMPAIGN_FIXTURES,
  createFormValues,
  getAsset,
} from "../src/lib/campaign-lab/fixtures.ts";
import {
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "../src/lib/campaign-lab/generation/guidance/pack.ts";
import { buildOpenAIMessages } from "../src/lib/campaign-lab/generation/prompt.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";

const root = process.cwd();
const outDir = path.join(root, ".local", "campaign-lab-design-harness");
mkdirSync(path.join(outDir, "requests"), { recursive: true });

function planFor(request) {
  const angle = request.allowed.angles[0];
  const layout =
    angle === "story-led"
      ? request.allowed.layouts.find((item) => item === "editorial-long-copy") ??
        request.allowed.layouts[0]
      : request.allowed.layouts[0];
  const sections = [...request.allowed.sectionOrders[layout][0]];
  const hasFacts = sections.includes("hero-facts") || sections.includes("detail");
  return {
    angle,
    layout,
    sections,
    factIds: hasFacts
      ? request.allowed.factIds.slice(
          0,
          Math.min(
            request.allowed.maxFacts,
            request.allowed.layoutFactCapacity[layout],
          ),
        )
      : [],
  };
}

function previewSummary(result) {
  if (!result.ok) return null;
  return {
    revision: result.preview.revision,
    productName: result.preview.brief.productName,
    audience: result.preview.brief.audience ?? null,
    objective: result.preview.brief.objective ?? null,
    offer: result.preview.brief.offer,
    destinationUrl: result.preview.brief.destinationUrl,
    actionLabel: result.preview.brief.actionLabel,
    asset: {
      id: result.preview.asset.id,
      width: result.preview.asset.width,
      height: result.preview.asset.height,
      contentHash: result.preview.asset.contentHash,
    },
    draft: {
      layout: result.preview.draft.layout,
      sections: result.preview.draft.sections,
      headline: result.preview.draft.headline,
      factIds: result.preview.draft.facts.map((fact) => fact.id),
    },
  };
}

async function captureFixture(fixtureId) {
  const fixture = CAMPAIGN_FIXTURES[fixtureId];
  const values = createFormValues(fixture);
  let captured = null;
  const provider = {
    id: "capture-model",
    label: "Capture model",
    model: "synthetic-capture",
    async generate(request) {
      captured = request;
      return planFor(request);
    },
  };
  const result = await runCampaignGeneration(
    { fixtureId, values },
    { provider },
  );
  if (!captured) throw new Error(`${fixtureId}: provider was not called`);
  if (!result.ok) throw new Error(`${fixtureId}: generation failed validation`);

  const messages = buildOpenAIMessages(captured);
  const record = {
    fixtureId,
    harnessVersion: DESIGN_HARNESS_VERSION,
    guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
    generation: result.generation,
    request: captured,
    providerMessages: messages,
    preview: previewSummary(result),
  };
  writeFileSync(
    path.join(outDir, "requests", `${fixtureId}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return record;
}

async function captureFailure(mode, code) {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const result = await runCampaignGeneration(
    { fixtureId: "sparse", values },
    {
      env: {
        CAMPAIGN_LAB_GENERATION_PROVIDER: "local-test",
        CAMPAIGN_LAB_GENERATION_TEST_MODE: mode,
        CAMPAIGN_LAB_GENERATION_TIMEOUT_MS: "50",
      },
    },
  );
  if (!result.ok) throw new Error(`${mode}: unexpected validation failure`);
  if (result.generation.status !== "fallback" || result.generation.code !== code) {
    throw new Error(
      `${mode}: expected fallback/${code}, got ${result.generation.status}/${result.generation.code}`,
    );
  }
  return {
    mode,
    generation: result.generation,
    revision: result.preview.revision,
    identity: {
      offer: result.preview.brief.offer,
      destinationUrl: result.preview.brief.destinationUrl,
      assetId: result.preview.asset.id,
    },
  };
}

function assertCapturedContext(record) {
  const request = record.request;
  if (!request.campaign.audience || !request.campaign.objective) {
    throw new Error(`${record.fixtureId}: audience/objective missing`);
  }
  if (!request.brand.character?.descriptor || !request.brand.tokens?.accent) {
    throw new Error(`${record.fixtureId}: brand character/tokens missing`);
  }
  const asset = getAsset(record.preview.asset.id);
  if (!asset) throw new Error(`${record.fixtureId}: selected asset missing`);
  if (
    request.assets.selected.width !== asset.width ||
    request.assets.selected.height !== asset.height
  ) {
    throw new Error(`${record.fixtureId}: asset dimensions missing`);
  }
  if (!request.template.capabilities?.layouts || !request.template.constraints?.limits) {
    throw new Error(`${record.fixtureId}: template capabilities/constraints missing`);
  }
  if (!request.campaign.facts.every((fact) => fact.source?.quote)) {
    throw new Error(`${record.fixtureId}: approved evidence source missing`);
  }
  if (
    request.guidance.hard.owner !== "ornigami" ||
    request.guidance.advisory.owner !== "adapted-taste-skill"
  ) {
    throw new Error(`${record.fixtureId}: guidance separation missing`);
  }
  const prompt = record.providerMessages
    .map((message) => message.content)
    .join("\n");
  for (const expected of [
    request.campaign.audience,
    request.campaign.objective,
    request.brand.tokens.accent,
    String(asset.width),
    DESIGN_HARNESS_VERSION,
    DESIGN_GUIDANCE_PACK_VERSION,
    "guidance",
  ]) {
    if (!prompt.includes(expected)) {
      throw new Error(
        `${record.fixtureId}: prompt did not include ${String(expected)}`,
      );
    }
  }
}

const records = [];
for (const fixtureId of ["sparse", "long-copy"]) {
  const record = await captureFixture(fixtureId);
  assertCapturedContext(record);
  records.push({
    fixtureId,
    audience: record.request.campaign.audience,
    objective: record.request.campaign.objective,
    requestedContext: {
      brandCharacter: record.request.brand.character,
      tokens: {
        accent: record.request.brand.tokens.accent,
        displayFont: record.request.brand.tokens.displayFont,
        bodyFont: record.request.brand.tokens.bodyFont,
      },
      assets: record.request.assets,
      template: {
        id: record.request.template.id,
        version: record.request.template.version,
        layouts: Object.keys(record.request.template.capabilities.layouts),
        limits: record.request.template.constraints.limits,
      },
      evidence: record.request.campaign.facts.map((fact) => ({
        id: fact.id,
        label: fact.label,
        value: fact.value,
        source: fact.source.document,
      })),
      guidance: {
        pack: record.request.guidance.pack,
        hardRules: record.request.guidance.hard.rules,
        advisoryRules: record.request.guidance.advisory.rules,
        sources: record.request.guidance.sources,
      },
    },
    generation: record.generation,
    preview: record.preview,
  });
}

const invalid = await captureFailure("invalid", "invalid");
const timeout = await captureFailure("timeout", "timeout");

const summary = {
  harnessVersion: DESIGN_HARNESS_VERSION,
  guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
  generatedAt: new Date().toISOString(),
  fixtures: records,
  recovery: { invalid, timeout },
};
writeFileSync(
  path.join(outDir, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
writeFileSync(
  path.join(outDir, "README.md"),
  `# Campaign Lab design harness evidence\n\nHarness ${DESIGN_HARNESS_VERSION}, guidance pack ${DESIGN_GUIDANCE_PACK_VERSION}.\n\n- \`requests/sparse.json\` and \`requests/long-copy.json\` contain the exact provider request and prompt for two different campaign contexts.\n- \`summary.json\` contains the focused generation, invalid-output, and timeout results.\n\nSynthetic fixtures only. This directory is Git-ignored and is not publication approval.\n`,
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      harnessVersion: DESIGN_HARNESS_VERSION,
      guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
      requests: records.map((record) => ({
        fixtureId: record.fixtureId,
        audience: record.audience,
        objective: record.objective,
        providerMode: record.generation.providerMode,
        angle: record.generation.angle,
        layout: record.generation.layout,
      })),
      recovery: summary.recovery,
      output: path.relative(root, outDir),
    },
    null,
    2,
  ),
);
