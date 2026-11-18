import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  BASE_CATALOG,
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "../src/lib/campaign-lab/fixtures.ts";
import {
  buildCampaignPreview,
  calculateDraftRevision,
  validateTemplateDraft,
} from "../src/lib/campaign-lab/template.ts";

const root = process.cwd();

async function loadCampaignPage() {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { transformSync } = await import("next/dist/build/swc/index.js");

  let source = readFileSync(
    path.join(root, "src", "components", "campaign-lab", "campaign-page.tsx"),
    "utf8",
  );
  source = source
    .replace(
      'import styles from "./campaign-page.module.css";',
      'const styles = new Proxy({}, { get: (_target, prop) => String(prop) });',
    )
    .replace(
      'import { PreviewImage } from "./preview-image";',
      'function PreviewImage(props) { return React.createElement("img", { src: props.src, alt: props.alt, width: props.width, height: props.height, "data-preview-image": "stub" }); }',
    )
    .replace(
      'import { findApprovedOfferPrice } from "@/lib/campaign-lab/offer-emphasis";',
      'function findApprovedOfferPrice(offer, approvedPrice) { const price = approvedPrice?.trim(); if (!price) return null; const start = offer.indexOf(price); if (start < 0) return null; return { start, end: start + price.length, text: price }; }',
    )
    .replace(
      /import \{[^}]*\} from "@\/lib\/campaign-lab\/presentation";/,
      'const { showsProductLabel, shouldShowClose } = require("../../../src/lib/campaign-lab/presentation.ts");',
    );

  const transformed = transformSync(`const React = require("react");\n${source}`, {
    filename: "campaign-page.tsx",
    jsc: {
      parser: { syntax: "typescript", tsx: true },
      transform: { react: { runtime: "classic" } },
    },
    module: { type: "commonjs" },
  }).code;
  const renderDir = path.join(root, ".local", "test-render");
  mkdirSync(renderDir, { recursive: true });
  const moduleDir = mkdtempSync(path.join(renderDir, "campaign-page-"));
  const moduleFile = path.join(moduleDir, "campaign-page.cjs");
  writeFileSync(moduleFile, transformed, "utf8");
  const pageModule = await import(pathToFileURL(moduleFile).href);
  rmSync(moduleDir, { recursive: true, force: true });
  return {
    CampaignPage: pageModule.CampaignPage,
    React,
    renderToStaticMarkup,
  };
}

function productLabelCount(html: string): number {
  return (html.match(/class="productLabel"/g) ?? []).length;
}

test("actual CampaignPage product-label markup follows shared whitespace normalization", async () => {
  const fixture = CAMPAIGN_FIXTURES.sparse;
  const values = createFormValues(fixture);
  const built = buildCampaignPreview(fixture, values, BASE_CATALOG);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const base = built.preview;
  const { CampaignPage, React, renderToStaticMarkup } = await loadCampaignPage();

  const render = (headline: string) => {
    const draft = { ...base.draft, headline };
    assert.deepEqual(
      validateTemplateDraft(base.brief, draft),
      [],
      `draft validation: ${headline}`,
    );
    const revision = calculateDraftRevision(
      base.brief,
      draft,
      base.asset,
      base.theme,
    );
    const html = renderToStaticMarkup(
      React.createElement(CampaignPage, {
        brief: base.brief,
        draft,
        asset: base.asset,
        theme: base.theme,
        headingId: "campaign-heading",
        imageRevision: revision,
        imageStatus: "loaded",
        imageAttempt: 0,
        onImageStateChange: () => {},
      }),
    );
    return { revision, labels: productLabelCount(html) };
  };

  const single = render("Harbor Field travel bottle");
  const double = render("Harbor  Field travel bottle");
  const caseDifference = render("harbor field travel bottle");
  const needsLabel = render("A durable bottle for the commute");
  const nonbreaking = render("Harbor\u00a0Field travel bottle");

  assert.equal(single.labels, 0);
  assert.equal(double.labels, 0);
  assert.equal(caseDifference.labels, 0);
  assert.equal(needsLabel.labels, 1);
  assert.equal(nonbreaking.labels, 1);
  assert.equal(single.revision, double.revision);
  assert.notEqual(needsLabel.revision, single.revision);
  assert.notEqual(caseDifference.revision, single.revision);
  assert.notEqual(nonbreaking.revision, single.revision);
});
