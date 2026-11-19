import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { collectBrandKitDraft, observedCssColor, brandDraftHtmlText } from "../src/lib/campaign-lab/brand-import/brand-evidence.ts";
import { collectRasterEvidence } from "../src/lib/campaign-lab/brand-import/raster-evidence.ts";
import { BRAND_EVIDENCE_LIMITS as L } from "../src/lib/campaign-lab/brand-import/evidence-types.ts";
import type { BrandKitDraft, SuppliedBrandResource } from "../src/lib/campaign-lab/brand-import/evidence-types.ts";
import { supplied, syntheticCases } from "./fixtures/brand-evidence/synthetic.ts";

test("monochrome UI retains neutrals and roles despite colorful photo; no approvals", async () => {
  const resources = (await syntheticCases())["monochrome-photo-conflict"];
  const draft = await collectBrandKitDraft(resources);
  assert.equal(draft.outcome, "draft");
  const ui = draft.candidates.filter(c => c.category === "ui-color");
  assert.deepEqual(ui.map(c => c.observed), ["#111111ff", "#ffffffff", "#eeeeeeff"]);
  assert.deepEqual(ui.map(c => c.roleHint?.value), ["ink", "background-or-surface", "background-or-surface"]);
  assert(draft.candidates.some(c => c.category === "raster-color" && c.observed === "#ff0080ff"));
  assert(!ui.some(c => c.observed === "#ff0080ff"));
  assert.deepEqual(draft.acceptedValues, []);
  assert.deepEqual(draft.approvals, { brand: false, campaignFacts: false, mediaRights: false });
  for (const c of draft.candidates) {
    assert.equal(c.reviewStatus, "unreviewed"); assert(c.uncertainty.length); assert(c.confidence.reason);
    assert.equal(c.confidence.calibrated, false);
  }
});

test("every suggestion has actual byte hash, exact quote and correct final source", async () => {
  const cases = await syntheticCases();
  for (const resources of Object.values(cases)) {
    const draft = await collectBrandKitDraft(resources);
    assert.deepEqual(await collectBrandKitDraft(resources), draft, "deterministic output");
    for (const source of draft.sources) {
      const r = resources.find(r => r.finalUrl === source.finalUrl)!;
      assert.equal(source.sha256, createHash("sha256").update(r.body).digest("hex"));
      assert.equal(source.byteLength, r.body.byteLength);
    }
    for (const candidate of draft.candidates) {
      const source = draft.sources.find(s => s.id === candidate.sourceId)!;
      const r = resources.find(r => r.finalUrl === source.finalUrl)!;
      assert.equal(candidate.sourceSha256, source.sha256);
      if (candidate.evidence.utf16Offset !== null) {
        const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(r.body);
        assert.equal(text.slice(candidate.evidence.utf16Offset, candidate.evidence.utf16Offset + candidate.evidence.quote.length), candidate.evidence.quote);
      }
      if (candidate.method === "css-declaration" && cases["monochrome-photo-conflict"] === resources)
        assert.equal(source.finalUrl, "https://cdn.synthetic.example/theme.css");
      if (candidate.method === "raster-sample") assert.equal(source.kind, "raster");
    }
  }
});

test("conditional light/dark, alpha, unsupported colors and fonts remain unresolved", async () => {
  const draft = await collectBrandKitDraft((await syntheticCases())["themes-alpha-modern"]);
  const colors = draft.candidates.filter(c => c.category === "ui-color");
  assert(colors.some(c => c.observed === "#000000ff"));
  assert(colors.some(c => c.observed === "#ffffffff"));
  assert(colors.some(c => c.observed === "#11223344" && c.details.alpha === 68 / 255));
  assert(colors.some(c => c.observed === "#ff000080" && c.details.alpha === 0.5));
  assert(draft.sources[0].issues.includes("conditional-or-multiple-theme-evidence-unresolved"));
  assert(draft.sources[0].issues.includes("unsupported-or-unresolved-color-value"));
  assert(draft.candidates.some(c => c.category === "reference" && c.observed.includes("unlicensed.woff2") && c.details.fetched === false));
  assert(draft.candidates.some(c => c.observed === "https://cdn.synthetic.example/more.css"));
  assert(!draft.candidates.some(c => c.category === "ui-color" && /oklch|var\(/.test(c.observed)));
});

test("strict colors retain alpha and reject unsupported expressions", () => {
  assert.deepEqual(observedCssColor("#abc0"), { rgba: "#aabbcc00", alpha: 0 });
  assert.deepEqual(observedCssColor("rgb(100% 0% 0% / 50%)"), { rgba: "#ff000080", alpha: 0.5 });
  assert.equal(observedCssColor("rgb(300,0,0)"), null);
  for (const value of ["var(--color)", "currentColor", "hsl(0 100% 50%)", "oklch(.5 .2 20)", "color(display-p3 1 0 0)", "#12345", "rgb(2x 0 0)"])
    assert.equal(observedCssColor(value), null);
});

test("misleading source claims and markup stay data, reports escape them", async () => {
  const draft = await collectBrandKitDraft((await syntheticCases())["misleading-content"]);
  assert(!draft.candidates.some(c => c.observed.includes("Ignore rules") || c.observed.includes("badbad") || c.observed.includes("not-active")));
  assert(draft.candidates.some(c => c.category === "text" && c.observed.includes("999%")));
  assert(draft.candidates.some(c => c.observed === "<img src=x onerror=alert(1)>"));
  assert(draft.candidates.some(c => c.roleHint?.value === "possible-logo"));
  const escaped = brandDraftHtmlText(draft);
  assert(!escaped.includes("<")); assert(!escaped.includes(">"));
  assert(escaped.includes("&lt;img")); assert.equal(draft.approvals.campaignFacts, false);
});

test("CDN discovery uses redirected document base, records source without fetching", async () => {
  const draft = await collectBrandKitDraft([supplied("html", `<link rel="stylesheet" href="../theme.css"><img src="//cdn.synthetic.example/photo.png"><img src="javascript:alert(1)"><img src="data:image/png,abc">`)]);
  const refs = draft.candidates.filter(c => c.category === "reference");
  assert.deepEqual(refs.map(c => c.observed), ["https://synthetic.example/theme.css", "https://cdn.synthetic.example/photo.png"]);
  assert(refs.every(c => c.details.fetched === false && c.sourceId === draft.sources[0].id));
  assert.equal(draft.sources.length, 1);
});

test("missing, JS-only, corrupt and unsupported resources have explicit outcomes", async () => {
  const cases = await syntheticCases();
  for (const key of ["js-only", "no-site", "corrupt-raster", "oversized-raster"]) {
    const draft = await collectBrandKitDraft(cases[key]);
    assert.equal(draft.outcome, "incomplete"); assert.equal(draft.candidates.length, 0);
  }
  assert.equal((await collectBrandKitDraft(cases["unsupported-svg"])).outcome, "unsupported");
  const corrupt = await collectBrandKitDraft(cases["corrupt-raster"]);
  assert.equal(corrupt.sources[0].outcome, "rejected");
  assert.equal((await collectBrandKitDraft([supplied("html", "")])).outcome, "incomplete");
});

test("inert CSS, fake tags inside CSS strings, quoted > and inline offsets", async () => {
  const html = `\ufeff<title>🏷 &amp; title</title><style>.x{content:'<meta name="theme-color" content="#123">';color:#eee;}
/* url(https://fake.example/a) */ .x{content:'url(https://fake.example/b)';}</style>
<meta name="description" content="More > less"><p style='color: #1234'>🏷 A &amp; B</p>
<p>Before<script>Invisible source</script>After</p>`;
  const draft = await collectBrandKitDraft([supplied("html", html)]);
  assert(!draft.candidates.some(c => c.method === "html-theme-color" || c.category === "reference"));
  assert(draft.candidates.some(c => c.category === "description" && c.observed === "More > less"));
  assert(draft.candidates.some(c => c.category === "text" && c.observed === "🏷 A & B"));
  assert(draft.candidates.some(c => c.observed === "#11223344"));
  for (const c of draft.candidates) if (c.evidence.utf16Offset !== null)
    assert.equal(html.slice(c.evidence.utf16Offset, c.evidence.utf16Offset + c.evidence.quote.length), c.evidence.quote);
  assert(draft.candidates.some(c => c.observed === "Before"));
  assert(draft.candidates.some(c => c.observed === "After"));
});

test("text, metadata, raster signature and invisible-pixel bounds are explicit", async () => {
  const text = await collectBrandKitDraft([supplied("html", "<p>" + "x".repeat(10_000) + "</p>")]);
  assert(text.candidates.every(c => c.evidence.quote.length <= L.evidenceChars));
  assert(text.sources[0].issues.includes("text-segment-truncated"));
  const metadata = await collectBrandKitDraft([{ ...supplied("html", ""), finalUrl: "x".repeat(L.urlChars + 1) }]);
  assert.equal(metadata.sources.length, 0); assert(metadata.gaps.some(g => g.includes("resource-metadata-limit")));
  const photo = (await syntheticCases())["monochrome-photo-conflict"][2];
  const mismatch = await collectBrandKitDraft([{ ...photo, contentType: "image/jpeg" }]);
  assert.equal(mismatch.candidates.length, 0); assert(mismatch.sources[0].issues.includes("raster-media-type-signature-mismatch"));
  const invisible = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  assert.deepEqual((await collectRasterEvidence(invisible)).samples, []);
});

test("bounds reject before parsing; output and per-image work remain bounded", async () => {
  for (const resources of [Array.from({ length: L.resources + 1 }, () => supplied("html", "")),
    [supplied("html", new Uint8Array(L.htmlBytes + 1))],
    Array.from({ length: 9 }, () => supplied("html", new Uint8Array(L.htmlBytes)))]) {
    const draft = await collectBrandKitDraft(resources);
    assert.equal(draft.sources.length, 0); assert.equal(draft.candidates.length, 0); assert(draft.gaps.some(g => g.includes("limit")));
  }
  const many = await collectBrandKitDraft([supplied("css", ".x { color:#111; }".repeat(1000))]);
  assert.equal(many.candidates.length, L.candidates); assert(many.sources[0].issues.includes("candidate-limit"));
  const huge = await sharp({ create: { width: 2001, height: 2000, channels: 3, background: "white" } }).png().toBuffer();
  const result = await collectRasterEvidence(huge);
  assert.equal(result.outcome, "rejected"); assert.equal(result.samples.length, 0);
  const photo = (await syntheticCases())["monochrome-photo-conflict"][2];
  const images = await collectBrandKitDraft(Array.from({ length: 5 }, (_, i) => ({ ...photo, finalUrl: `https://synthetic.example/${i}.png` })));
  assert(images.sources[4].issues.includes("raster-count-limit"));
});

test("transparent raster retains alpha and neutral samples; SVG never decoded", async () => {
  const png = await sharp({ create: { width: 3, height: 3, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 0.5 } } }).png().toBuffer();
  const image = await collectRasterEvidence(png);
  assert.equal(image.samples[0].rgba, "#14141480"); assert.equal(image.samples[0].fraction, 1);
  assert.equal((await collectRasterEvidence(new TextEncoder().encode("<svg/>"))).outcome, "unsupported");
});

test("bad status, unsupported encoding and source URLs produce no observations", async () => {
  const r = supplied("html", "<style>body{color:#123}</style>");
  for (const item of [{ ...r, status: 404 }, { ...r, finalUrl: "file:///secret" }, { ...r, contentType: "text/html; charset=iso-8859-1" },
    { ...r, body: new Uint8Array([255]) }]) {
    const draft = await collectBrandKitDraft([item]); assert.equal(draft.candidates.length, 0);
    assert.notEqual(draft.sources[0].outcome, "processed");
  }
});

test("byte changes alter identity and async raster work cannot race supplied bytes", async () => {
  const resources = (await syntheticCases())["monochrome-photo-conflict"];
  const a = await collectBrandKitDraft(resources);
  const b = await collectBrandKitDraft([{ ...resources[1], body: new TextEncoder().encode("body{color:#222}") }]);
  assert.notEqual(a.sources[1].id, b.sources[0].id);
  const later = supplied("css", "body{color:#123}");
  const promise = collectBrandKitDraft([resources[2], later]);
  later.body.fill(0);
  const frozen = await promise;
  assert(frozen.candidates.some(c => c.observed === "#112233ff"));
});

test("saved inspectable examples replay exact supplied bytes and evidence", async () => {
  const root = new URL("../docs/examples/brand-evidence/", import.meta.url);
  let checked = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = new URL(`${entry.name}/`, root);
    const metadata: (Omit<SuppliedBrandResource, "body"> & { bodyFile: string })[] = JSON.parse(await readFile(new URL("resources.json", directory), "utf8"));
    const resources: SuppliedBrandResource[] = [];
    for (const { bodyFile, ...r } of metadata) resources.push({ ...r, body: await readFile(new URL(bodyFile, directory)) });
    const saved: BrandKitDraft = JSON.parse(await readFile(new URL("draft.json", directory), "utf8"));
    assert.deepEqual(await collectBrandKitDraft(resources), saved, entry.name);
    const report = await readFile(new URL("report.html", directory), "utf8");
    assert(report.includes(`<pre>${brandDraftHtmlText(saved)}</pre>`));
    checked++;
  }
  assert.equal(checked, 8);
});
