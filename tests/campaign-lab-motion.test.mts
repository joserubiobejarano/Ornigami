import assert from "node:assert/strict";
import test from "node:test";
import { BASE_CATALOG, createFormValues } from "../src/lib/campaign-lab/fixtures.ts";
import { buildCampaignPreview, calculateDraftRevision } from "../src/lib/campaign-lab/template.ts";
import { motionPresentation, assertCurrentMotion } from "../src/lib/campaign-lab/motion.ts";
import { campaignMotionRuntimeSource } from "../src/lib/campaign-lab/motion-runtime.ts";
import { assertHtmlReceiptAgreement, buildStandaloneDocument, auditArchiveReferences, isLocalPreviewApproved } from "../src/lib/campaign-lab/export.ts";
import { resolveCampaignImage } from "../src/lib/campaign-lab/presentation.ts";

test("recipe and actual runtime identity change the approved rendered revision", () => {
  const fixture = Object.values(BASE_CATALOG.fixtures)[0];
  const built = buildCampaignPreview(fixture, createFormValues(fixture), BASE_CATALOG);
  assert.ok(built.ok);
  if (!built.ok) return;
  const p = built.preview;
  const revision = (motion: ReturnType<typeof motionPresentation>) => calculateDraftRevision(p.brief, p.draft, p.asset, p.theme, null, motion);
  const staticId = revision(motionPresentation());
  const quiet = motionPresentation("quiet-product");
  const ids = [staticId, revision(quiet), revision(motionPresentation("product-inspect")), revision({ ...quiet, runtimeIdentity: "changed-runtime" }), revision({ ...quiet, recipeVersion: "2.0.0" as typeof quiet.recipeVersion })];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(isLocalPreviewApproved({ revision: ids[1], approvalRevision: staticId, dirty: false, generating: false, imagesReady: true }), false);
  assert.throws(() => assertCurrentMotion({ ...quiet, runtimeIdentity: "stale" }), /fresh preview/);
});

test("image policy preserves product heroes and explicit editorial framing, and affects identity", () => {
  const fixture = BASE_CATALOG.fixtures["long-copy"];
  const built = buildCampaignPreview(fixture, createFormValues(fixture), BASE_CATALOG);
  assert.ok(built.ok); if (!built.ok) return;
  const p = built.preview;
  assert.deepEqual(resolveCampaignImage(p.asset, p.theme.tokens), { fit: "contain", frame: "natural-arch" });
  assert.deepEqual(resolveCampaignImage({ role: "product-in-use" }, p.theme.tokens), { fit: "cover", frame: "compact" });
  assert.deepEqual(resolveCampaignImage({ ...p.asset, imageFit: "cover" }, p.theme.tokens), { fit: "cover", frame: "compact" });
  assert.notEqual(calculateDraftRevision(p.brief, p.draft, { ...p.asset, imageFit: "cover" }, p.theme), p.revision);
});

test("image presentation metadata must agree with its optional receipt field", () => {
  const imagePresentation = { fit: "contain", frame: "natural-arch" } as const;
  const html = buildStandaloneDocument({ title: "Synthetic", bodyHtml: "<article>fixed</article>", revision: "fixed", previewStatus: "confirmed", packshotSha256: "abc", imagePresentation });
  assert.match(html, /campaign-lab-image-presentation/);
  const receipt = { preview: { imagePresentation } } as Parameters<typeof assertHtmlReceiptAgreement>[1];
  assert.throws(() => assertHtmlReceiptAgreement(html.replace('contain', 'cover'), receipt), /image presentation/);
});

test("static export stays script-free; enhancements contain only owned local runtime and closed config", () => {
  const input = { title: "Synthetic", bodyHtml: "<article><p>Fixed offer</p></article>", revision: "fixed", previewStatus: "confirmed" as const, packshotSha256: "abc" };
  assert.doesNotMatch(buildStandaloneDocument({ ...input, motion: motionPresentation() }), /<script/);
  const html = buildStandaloneDocument({ ...input, motion: motionPresentation("product-inspect") });
  assert.match(html, /src="\.\/motion.js" defer/);
  assert.match(html, /type="application\/json"/);
  assert.deepEqual(auditArchiveReferences(html, "", ["styles.css", "motion.js"]).scripts, ["motion.js"]);
  assert.throws(() => auditArchiveReferences(html, "", ["styles.css"]), /missing referenced/);
  assert.throws(() => auditArchiveReferences(html.replace('./motion.js', 'https://example.com/motion.js'), "", ["styles.css"]), /external/);
  assert.throws(() => auditArchiveReferences(html.replace('./motion.js', './arbitrary.js'), "", ["styles.css", "arbitrary.js"]), /owned motion/);
  assert.throws(() => buildStandaloneDocument({ ...input, motion: { ...motionPresentation("product-inspect"), recipe: "arbitrary" as "none" } }), /Unknown motion/);
  assert.doesNotMatch(campaignMotionRuntimeSource(), /\b(?:eval|fetch|import)\s*\(/);
  const receipt = { preview: { motion: motionPresentation("product-inspect") } } as Parameters<typeof assertHtmlReceiptAgreement>[1];
  const tampered = html.replace(/(<script type="application\/json" id="ornigami-motion-config">)[\s\S]*?<\/script>/, '$1{"recipe":"none"}</script>');
  assert.throws(() => assertHtmlReceiptAgreement(tampered, receipt), /runtime configuration/);
});
