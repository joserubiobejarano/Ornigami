#!/usr/bin/env node
/**
 * Collect Campaign Lab generation results into the evaluation pack's draft
 * artifact shape.
 *
 * This adapter talks to the flow's HTTP API only. It does not import the app
 * route, renderer, or provider adapter. It supports the two fixture IDs the
 * flow exposes today (sparse and long-copy) and maps them to the matching
 * evaluation cases. Cases the flow cannot express are omitted and remain
 * unassessed in the report.
 *
 * Usage:
 *   node scripts/campaign-eval-collect-flow.mjs --url http://127.0.0.1:3100 --out .local/campaign-eval/flow
 *   node scripts/campaign-eval-collect-flow.mjs --url ... --out ... --fixtures sparse,long-copy --expect generated
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FIXTURES = {
  sparse: {
    caseId: "sparse-offer",
    values: {
      brandId: "harbor-field",
      accent: "#9a3f25",
      productName: "Harbor Field travel bottle",
      offer: "20% off, 27–30 November 2026",
      destinationUrl: "https://example.com/harbor-field",
      assetId: "harbor-field-bottle-front",
    },
  },
  "long-copy": {
    caseId: "rich-angle",
    values: {
      brandId: "morrow-ceramic",
      accent: "#234a6b",
      productName: "Morrow ceramic pour-over dripper",
      offer: "Free shipping through 30 November 2026",
      destinationUrl: "https://example.com/morrow",
      assetId: "morrow-ceramic-dripper-front",
    },
  },
};

function usage() {
  return `Collect Campaign Lab generation into evaluation artifacts

Usage:
  node scripts/campaign-eval-collect-flow.mjs --url <origin> --out <dir> [options]

Options:
  --url <origin>          Campaign Lab origin, for example http://127.0.0.1:3100
  --out <dir>             Destination directory for draft artifacts
  --fixtures <list>       Comma-separated fixtures (default: sparse,long-copy)
  --expect <status>       Require generation.status to be "generated" or "fallback"
  --revision              Also collect the late offer/destination revision for sparse
  --request-id <text>     Prefix for request IDs (default: campaign-eval)
  --help, -h              Show this help
`;
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: false,
    options: {
      url: { type: "string" },
      out: { type: "string" },
      fixtures: { type: "string" },
      expect: { type: "string" },
      revision: { type: "boolean", default: false },
      "request-id": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (parsed.values.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!parsed.values.url) throw new Error("--url is required");
  if (!parsed.values.out) throw new Error("--out is required");
  const fixtures = (parsed.values.fixtures ?? "sparse,long-copy").split(",").map((value) => value.trim()).filter(Boolean);
  for (const fixture of fixtures) {
    if (!FIXTURES[fixture]) throw new Error(`Unsupported fixture: ${fixture}. Use sparse or long-copy.`);
  }
  if (parsed.values.expect && !["generated", "fallback"].includes(parsed.values.expect)) {
    throw new Error('--expect must be "generated" or "fallback"');
  }
  return {
    url: parsed.values.url.replace(/\/$/, ""),
    out: path.resolve(parsed.values.out),
    fixtures,
    expect: parsed.values.expect ?? null,
    revision: parsed.values.revision,
    requestId: parsed.values["request-id"] ?? "campaign-eval",
  };
}

async function generate(options, fixture, values, requestId) {
  const response = await fetch(`${options.url}/api/campaign-lab/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId: fixture, values, requestId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(`${fixture}: HTTP ${response.status()} ${body?.message ?? "(no JSON body)"}`);
  }
  if (!body.ok) {
    throw new Error(`${fixture}: generation rejected: ${JSON.stringify(body.issues ?? body.message ?? body)}`);
  }
  if (options.expect && body.generation?.status !== options.expect) {
    throw new Error(`${fixture}: expected generation.status ${options.expect}, observed ${body.generation?.status ?? "(none)"}`);
  }
  return body;
}

function toArtifact(caseId, body, extra = {}) {
  const { brief, draft, asset, revision } = body.preview;
  return {
    schemaVersion: 1,
    caseId,
    source: "generated",
    sourceLabel: `Campaign Lab flow: ${body.generation?.providerLabel ?? body.generation?.provider ?? "unknown"} (${body.generation?.status ?? "unknown"})`,
    template: { id: draft.templateId, version: draft.templateVersion },
    campaign: {
      brandId: brief.brandId,
      productName: brief.productName,
      offer: brief.offer,
      destinationUrl: brief.destinationUrl,
      actionLabel: brief.actionLabel,
    },
    draft: {
      layout: draft.layout,
      headline: draft.headline,
      lede: draft.lede,
      facts: (draft.facts ?? []).map((fact) => ({ label: fact.label, value: fact.value })),
      sections: (draft.sections ?? []).map((section, index) => ({
        id: typeof section === "string" ? section : section.id ?? `section-${index + 1}`,
        heading: "",
        emphasis: index + 1,
      })),
      assetIds: [asset.id],
      claims: [draft.headline, draft.lede].filter(Boolean),
    },
    flow: {
      generation: body.generation ?? null,
      revision,
      requestId: body.requestId ?? null,
      asset: { id: asset.id, src: asset.src, alt: asset.alt, contentHash: asset.contentHash },
    },
    ...extra,
  };
}

function writeJson(dir, name, value) {
  writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${path.join(dir, name)}`);
}

async function main() {
  const options = parseCli();
  mkdirSync(options.out, { recursive: true });
  const collected = [];
  for (const fixture of options.fixtures) {
    const mapping = FIXTURES[fixture];
    const body = await generate(options, fixture, mapping.values, `${options.requestId}-${fixture}`);
    const artifact = toArtifact(mapping.caseId, body);
    writeJson(options.out, `${mapping.caseId}.json`, artifact);
    collected.push({ fixture, caseId: mapping.caseId, status: body.generation?.status, angle: body.generation?.angle });
  }

  if (options.revision) {
    const values = FIXTURES.sparse.values;
    const before = await generate(options, "sparse", values, `${options.requestId}-revision-before`);
    const after = await generate(
      options,
      "sparse",
      { ...values, offer: "25% off, 27–30 November 2026", destinationUrl: "https://example.com/harbor-field-offer" },
      `${options.requestId}-revision-after`,
    );
    const bundle = {
      schemaVersion: 1,
      caseId: "failure-revision",
      before: toArtifact("failure-revision", before, { approval: { state: "unknown" } }),
      after: toArtifact("failure-revision", after, { approval: { state: "unknown" } }),
      change: {
        fromOffer: "20% off, 27–30 November 2026",
        toOffer: "25% off, 27–30 November 2026",
        fromDestination: "https://example.com/harbor-field",
        toDestination: "https://example.com/harbor-field-offer",
      },
    };
    writeJson(options.out, "failure-revision.revision.json", bundle);
    collected.push({ fixture: "sparse", caseId: "failure-revision", status: "revision", angle: null });
  }

  console.log("\nCollected:");
  for (const item of collected) {
    console.log(`- ${item.caseId} (${item.fixture}): ${item.status}${item.angle ? `, angle ${item.angle}` : ""}`);
  }
  console.log("\nRun: node scripts/campaign-eval.mjs evaluate --drafts " + path.relative(root, options.out));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
