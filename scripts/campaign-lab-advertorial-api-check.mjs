#!/usr/bin/env node
/**
 * Deterministic API regressions for the advertorial route.
 *
 * Usage:
 *   node scripts/campaign-lab-advertorial-api-check.mjs --url http://localhost:3100
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: cli } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    out: { type: "string", default: ".local/campaign-lab-advertorial-api" },
  },
});

const baseUrl = cli.url.replace(/\/$/, "");
const outDir = path.resolve(process.cwd(), cli.out);
const checks = [];
const add = (id, ok, detail, evidence = {}) => {
  checks.push({ id, state: ok ? "passed" : "failed", detail, evidence });
};

const fullValues = {
  brandId: "morrow-ceramic",
  accent: "#234a6b",
  productName: "Morrow ceramic pour-over dripper",
  offer: "Free shipping through 30 November 2026",
  destinationUrl: "https://example.com/morrow",
  assetId: "morrow-ceramic-dripper-front",
  openingFocus: "flow-control",
  format: "advertorial",
  advertorialLayout: "auto",
};

async function post(body) {
  const response = await fetch(`${baseUrl}/api/campaign-lab/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const base = await post({ fixtureId: "morrow-advertorial-full", values: fullValues });
add(
  "base-preview",
  base.status === 200 &&
    base.body?.ok === true &&
    base.body?.preview?.asset?.id === "morrow-ceramic-dripper-front",
  "The approved Morrow packshot produces a preview.",
  { status: base.status, assetId: base.body?.preview?.asset?.id, revision: base.body?.preview?.revision },
);

const wrongPackshot = await post({
  fixtureId: "morrow-advertorial-full",
  values: { ...fullValues, assetId: "harbor-field-bottle-front" },
});
add(
  "wrong-packshot-rejected",
  wrongPackshot.status === 422 &&
    wrongPackshot.body?.ok === false &&
    wrongPackshot.body?.preview === undefined &&
    wrongPackshot.body?.issues?.some(
      (issue) => issue.field === "assetId" && /approved packshot/i.test(issue.message),
    ),
  "A Harbor Field bottle cannot replace the Morrow packshot and no preview is returned.",
  {
    status: wrongPackshot.status,
    issues: wrongPackshot.body?.issues,
    hasPreview: Boolean(wrongPackshot.body?.preview),
  },
);

const wrongRole = await post({
  fixtureId: "morrow-advertorial-full",
  values: { ...fullValues, assetId: "morrow-ribs" },
});
add(
  "wrong-role-rejected",
  wrongRole.status === 422 &&
    wrongRole.body?.issues?.some(
      (issue) => issue.field === "assetId" && /approved packshot/i.test(issue.message),
    ),
  "A supporting-role image cannot be used as the packshot.",
  { status: wrongRole.status, issues: wrongRole.body?.issues },
);

const edited = await post({
  fixtureId: "morrow-advertorial-full",
  values: {
    ...fullValues,
    offer: "Free shipping through 31 December 2026",
    destinationUrl: "https://example.com/morrow-dripper",
  },
});
add(
  "offer-destination-edits-preserved",
  edited.status === 200 &&
    edited.body?.preview?.brief?.offer === "Free shipping through 31 December 2026" &&
    edited.body?.preview?.brief?.destinationUrl === "https://example.com/morrow-dripper" &&
    edited.body?.preview?.asset?.id === "morrow-ceramic-dripper-front" &&
    edited.body?.preview?.revision !== base.body?.preview?.revision,
  "Legitimate offer and destination edits keep the approved packshot and change the revision.",
  {
    status: edited.status,
    offer: edited.body?.preview?.brief?.offer,
    destinationUrl: edited.body?.preview?.brief?.destinationUrl,
    assetId: edited.body?.preview?.asset?.id,
    baseRevision: base.body?.preview?.revision,
    editedRevision: edited.body?.preview?.revision,
  },
);

const onePhoto = await post({
  fixtureId: "morrow-advertorial-full",
  values: { ...fullValues, advertorialLayout: "advertorial-one-photo" },
});
add(
  "full-brief-one-photo-complete-group",
  onePhoto.status === 200 &&
    onePhoto.body?.preview?.draft?.layout === "advertorial-one-photo" &&
    onePhoto.body?.preview?.draft?.sections?.at(-1) === "product" &&
    onePhoto.body?.preview?.draft?.sections?.includes("evidence") === false &&
    onePhoto.body?.preview?.assets?.length === 1 &&
    ["interior", "outlet", "body"].every((id) =>
      onePhoto.body?.preview?.draft?.facts?.some((fact) => fact.id === id),
    ),
  "The same brief and three-fact group fit the one-photo layout with one packshot.",
  {
    status: onePhoto.status,
    layout: onePhoto.body?.preview?.draft?.layout,
    sections: onePhoto.body?.preview?.draft?.sections,
    factIds: onePhoto.body?.preview?.draft?.facts?.map((fact) => fact.id),
    assets: onePhoto.body?.preview?.assets?.map((entry) => entry.asset.id),
  },
);

const full = await post({
  fixtureId: "morrow-advertorial-full",
  values: { ...fullValues, advertorialLayout: "advertorial-full" },
});
add(
  "full-layout-complete-group",
  full.status === 200 &&
    full.body?.preview?.draft?.layout === "advertorial-full" &&
    full.body?.preview?.draft?.sections?.at(-1) === "product" &&
    full.body?.preview?.assets?.length === 3 &&
    ["interior", "outlet", "body"].every((id) =>
      full.body?.preview?.draft?.facts?.some((fact) => fact.id === id),
    ),
  "The full layout keeps the same complete group and ends at the product block.",
  {
    status: full.status,
    layout: full.body?.preview?.draft?.layout,
    sections: full.body?.preview?.draft?.sections,
    factIds: full.body?.preview?.draft?.facts?.map((fact) => fact.id),
    assets: full.body?.preview?.assets?.map((entry) => entry.asset.id),
  },
);

mkdirSync(outDir, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  checks,
  requests: {
    base: base.body,
    wrongPackshot: wrongPackshot.body,
    wrongRole: wrongRole.body,
    edited: edited.body,
    onePhoto: onePhoto.body,
    full: full.body,
  },
};
writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

const failed = checks.filter((check) => check.state === "failed");
console.log(
  JSON.stringify(
    {
      status: failed.length === 0 ? "passed" : "failed",
      checks: checks.length,
      failed: failed.length,
      out: path.join(outDir, "report.json"),
      results: checks.map(({ id, state, detail }) => ({ id, state, detail })),
    },
    null,
    2,
  ),
);
if (failed.length > 0) process.exitCode = 1;
