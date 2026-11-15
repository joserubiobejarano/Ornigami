#!/usr/bin/env node
/**
 * Local fixture double for the campaign-lab evaluation pack.
 *
 * This is NOT the `/campaign-lab` route, the template renderer, or the provider
 * adapter. It serves the pack's own artifacts as plain semantic HTML so the
 * focused browser checks can be verified before integration and re-run without
 * touching the app. Every page is generated from a draft artifact in
 * `tests/fixtures/campaign-eval/`.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtures = path.join(root, "tests", "fixtures", "campaign-eval");
const pack = JSON.parse(readFileSync(path.join(fixtures, "cases.json"), "utf8"));
const casesById = new Map(pack.cases.map((caseDef) => [caseDef.id, caseDef]));

function readArtifact(relative) {
  return JSON.parse(readFileSync(path.join(fixtures, relative), "utf8"));
}

const sources = {
  "sparse-offer": {
    baseline: readArtifact("baseline/sparse-offer.json"),
    generated: readArtifact("samples/generated/sparse-offer.json"),
    failure: readArtifact("samples/failures/unsupported-claims.json"),
    missing: readArtifact("samples/failures/missing-input.json"),
  },
  "rich-angle": {
    baseline: readArtifact("baseline/rich-angle.json"),
    generated: readArtifact("samples/generated/rich-angle.json"),
    thin: readArtifact("samples/failures/rich-thin.json"),
  },
  "intent-change": {
    baseline: readArtifact("baseline/intent-change.json"),
    generated: readArtifact("samples/generated/intent-change.json"),
    unchanged: readArtifact("samples/failures/intent-unchanged.json"),
  },
  "failure-revision": {
    baseline: readArtifact("baseline/failure-revision.json"),
    before: readArtifact("samples/generated/failure-revision.revision.json").before,
    after: readArtifact("samples/generated/failure-revision.revision.json").after,
    stale: readArtifact("samples/failures/revision-stale.revision.json").after,
  },
  "trap-asset-label": {
    baseline: readArtifact("baseline/trap-asset-label.json"),
    generated: readArtifact("samples/generated/trap-asset-label.json"),
  },
};

const assetFiles = new Map();
for (const caseDef of pack.cases) {
  for (const asset of caseDef.approvedAssets) {
    assetFiles.set(asset.id, asset);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandFor(caseDef) {
  return caseDef.campaign.brandName;
}

function renderPage(caseDef, artifact) {
  const draft = artifact.draft;
  const assets = (draft.assetIds ?? []).map((id) => assetFiles.get(id)).filter(Boolean);
  const facts = (draft.facts ?? [])
    .map((fact) => `<li data-fact><span>${escapeHtml(fact.label)}</span> <span>${escapeHtml(fact.value)}</span></li>`)
    .join("");
  const sections = (draft.sections ?? [])
    .map(
      (section) =>
        `<section data-section="${escapeHtml(section.id)}" data-emphasis="${escapeHtml(section.emphasis ?? "")}"><h2>${escapeHtml(section.heading)}</h2></section>`,
    )
    .join("");
  const images = assets
    .map(
      (asset) =>
        `<figure><img data-role="product" src="/assets/${encodeURIComponent(path.basename(asset.file))}" alt="${escapeHtml(asset.alt)}" width="1200" height="1500"></figure>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(caseDef.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${caseDef.campaign.brandId === "morrow-ceramic" ? "#f2ebde" : caseDef.campaign.brandId === "fernway" ? "#eef0ec" : "#f4eee4"}; color: #232420; font-family: ${caseDef.campaign.brandId === "morrow-ceramic" ? "Georgia, serif" : "Arial, sans-serif"}; }
  main { max-width: 1180px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }
  header { font-size: 14px; letter-spacing: .16em; text-transform: uppercase; }
  h1 { font-size: clamp(30px, 6vw, 64px); line-height: 1.02; margin: 0; max-width: 18ch; }
  .lede { font-size: 18px; line-height: 1.5; max-width: 58ch; }
  figure { margin: 0; }
  img { display: block; width: 100%; height: auto; border-radius: 6px; }
  ul { display: flex; flex-wrap: wrap; gap: 10px 24px; padding: 0; list-style: none; }
  li { border-top: 1px solid #c9bdaa; padding-top: 6px; min-width: 120px; }
  .offer { border-left: 4px solid #9a3f25; padding-left: 12px; }
  .offer p { margin: 4px 0; font-size: 18px; }
  .cta { display: inline-block; background: #9a3f25; color: #fff8ee; padding: 14px 20px; text-decoration: none; font-weight: 700; border-radius: 6px; }
  section { border-top: 1px solid #d7cab7; padding-top: 12px; }
  h2 { font-size: 20px; margin: 0; }
  @media (min-width: 900px) {
    main { grid-template-columns: 1fr 1fr; align-items: start; }
    header, .offer, .cta, section { grid-column: 1 / -1; }
    figure { grid-row: span 2; }
  }
</style>
</head>
<body>
<main data-case="${escapeHtml(caseDef.id)}" data-source="${escapeHtml(artifact.source)}" data-revision="${escapeHtml(artifact.approval?.revision ?? "")}">
  <header><span data-role="brand">${escapeHtml(brandFor(caseDef))}</span></header>
  <div>
    <h1 data-role="headline">${escapeHtml(draft.headline)}</h1>
    <p class="lede" data-role="lede">${escapeHtml(draft.lede)}</p>
    <ul data-role="facts">${facts}</ul>
  </div>
  <div class="offer" data-role="offer"><p>Offer</p><p>${escapeHtml(artifact.campaign.offer)}</p></div>
  <a class="cta" data-role="cta" href="${escapeHtml(artifact.campaign.destinationUrl)}">${escapeHtml(artifact.campaign.actionLabel)}</a>
  ${images}
  ${sections}
</main>
</body>
</html>`;
}

function send(response, status, type, body) {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/assets/")) {
    const name = path.basename(decodeURIComponent(url.pathname.slice("/assets/".length)));
    const file = path.join(fixtures, "assets", name);
    if (!existsSync(file)) return send(response, 404, "text/plain", "Not found");
    return send(response, 200, "image/svg+xml", readFileSync(file));
  }
  if (url.pathname === "/health") return send(response, 200, "text/plain", "ok");
  const match = /^\/case\/([a-z0-9-]+)$/.exec(url.pathname);
  if (!match) return send(response, 404, "text/plain", "Not found");
  const caseDef = casesById.get(match[1]);
  if (!caseDef) return send(response, 404, "text/plain", "Unknown case");
  const source = url.searchParams.get("source") ?? "baseline";
  const artifact = sources[caseDef.id]?.[source];
  if (!artifact) return send(response, 404, "text/plain", `Unknown source ${source} for ${caseDef.id}`);
  return send(response, 200, "text/html; charset=utf-8", renderPage(caseDef, artifact));
});

const port = Number(process.env.CAMPAIGN_EVAL_PORT ?? "0");
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.log(`http://127.0.0.1:${address.port}`);
});
