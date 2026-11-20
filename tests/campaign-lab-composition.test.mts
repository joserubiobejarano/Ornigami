import assert from "node:assert/strict";
import test from "node:test";
import { parseOfferComposition, resolveCampaignComposition } from "../src/lib/campaign-lab/composition.ts";
import { buildBrowserOfferCatalog, type BrowserOfferIntakeInput } from "../src/lib/campaign-lab/browser-offer.ts";
import { browserOfferBriefFromIntake, parseBrowserOfferBriefRequest } from "../src/lib/campaign-lab/browser-offer-brief.ts";
import { parsePersistedOfferIntakeBrief, parsePreparedOfferIntakeBrief, serializePersistedOfferIntakeBrief } from "../src/lib/campaign-lab/offer-intake-brief.ts";
import { createFormValues } from "../src/lib/campaign-lab/fixtures.ts";
import { buildCampaignPreview, buildDraftRevisionIdentity, calculateDraftRevision } from "../src/lib/campaign-lab/template.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import { LocalTestGenerationProvider } from "../src/lib/campaign-lab/generation/local-test-provider.ts";
import type { GenerationRequest } from "../src/lib/campaign-lab/generation/types.ts";

const brief = {
  brandName: "Lumen", productName: "Lumen care box", audience: "", objective: "",
  offer: "20% off, $12", destinationUrl: "https://example.invalid/lumen",
  facts: [{ label: "Contents", value: "Three pieces" }, { label: "Material", value: "Paper box" }],
  alt: "Synthetic square product package", rights: "App-owned synthetic test asset",
};
function input(): BrowserOfferIntakeInput {
  return { ...brief, directionId: "editorial", composition: "product-focus", reviewedOn: "2026-11-20",
    packshot: { src: "blob:synthetic", width: 1000, height: 1000, contentHash: "a".repeat(64), alt: brief.alt, rights: brief.rights } };
}
function context() {
  const built = buildBrowserOfferCatalog(input());
  return { ...built, values: createFormValues(built.fixture, built.catalog) };
}
test("composition is a bounded scalar; old/default inputs keep default behavior", () => {
  assert.equal(parseOfferComposition(undefined), "direction-default");
  assert.equal(parseOfferComposition("direction-default"), "direction-default");
  for (const value of [null, false, 1, {}, ["product-focus"], "editorial", ""]) assert.throws(() => parseOfferComposition(value), /Composition/);
  assert.equal(resolveCampaignComposition({}, { role: "product-hero" }), undefined);
});
test("prepared and session briefs preserve the independent choice and reject malformed values", () => {
  for (const composition of [undefined, "direction-default", "product-focus"] as const) {
    const prepared = parsePreparedOfferIntakeBrief(JSON.stringify({ schemaVersion: 1, ...brief, composition }));
    assert.ok(prepared.ok); assert.equal(prepared.brief.composition, composition);
    const restored = parsePersistedOfferIntakeBrief(serializePersistedOfferIntakeBrief({ ...brief, composition }));
    assert.equal(restored?.composition, composition);
  }
  for (const composition of [null, {}, "unknown"]) {
    assert.equal(parsePreparedOfferIntakeBrief(JSON.stringify({ schemaVersion: 1, ...brief, composition })).ok, false);
    assert.equal(parsePersistedOfferIntakeBrief(JSON.stringify({ schemaVersion: 1, ...brief, composition })), null);
  }
});
test("HTTP browser brief preserves choice without admitting tokens, objects or unknown fields", () => {
  const wire = browserOfferBriefFromIntake(input());
  const parsed = parseBrowserOfferBriefRequest(wire); assert.ok(parsed.ok);
  assert.equal(parsed.input.composition, "product-focus");
  for (const composition of [null, { mobileHeroOrder: "product-second" }, "unknown", 0]) {
    const rejected = parseBrowserOfferBriefRequest({ ...wire, composition }); assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.ok(rejected.issues.some(i => i.field === "composition"));
  }
  assert.equal(parseBrowserOfferBriefRequest({ ...wire, compositionTokens: { width: "999px" } }).ok, false);
});
test("composition changes revision while typography, commercial inputs, assets and default identity stay fixed", () => {
  const {fixture,catalog,values} = context();
  const focused = buildCampaignPreview(fixture, values, catalog); assert.ok(focused.ok);
  const defaulted = buildCampaignPreview(fixture, { ...values, composition: undefined }, catalog); assert.ok(defaulted.ok);
  const explicit = buildCampaignPreview(fixture, { ...values, composition: "direction-default" }, catalog); assert.ok(explicit.ok);
  assert.equal(defaulted.preview.revision, explicit.preview.revision);
  assert.notEqual(focused.preview.revision, defaulted.preview.revision);
  assert.deepEqual(focused.preview.theme, defaulted.preview.theme);
  assert.deepEqual(focused.preview.asset, defaulted.preview.asset);
  assert.equal(focused.preview.brief.offer, brief.offer);
  assert.equal(focused.preview.composition?.version, "1.0.0");
  const p=focused.preview;
  const identity=buildDraftRevisionIdentity(p.brief,p.draft,p.asset,p.theme);
  assert.equal(identity.composition?.containedPackshot,true);
  assert.notEqual(calculateDraftRevision(p.brief,{...p.draft,layout:p.draft.layout === "editorial-long-copy" ? "offer-led-one-photo" : "editorial-long-copy",sections:["hero","detail","close"]},p.asset,p.theme),p.revision);
});
test("packshot sizing never leaks into narrative, cover or role-less images", () => {
  assert.equal(resolveCampaignComposition({composition:"product-focus"},{role:"product-hero"})?.containedPackshot,true);
  for (const asset of [{role:"story-opening" as const}, {role:"product-hero" as const,imageFit:"cover" as const}, {}]) {
    assert.equal(resolveCampaignComposition({composition:"product-focus"},asset)?.containedPackshot,false);
  }
});
test("generation context and success preserve explicit composition even for another allowed layout", async () => {
  const {fixture,catalog,values}=context(); let request: GenerationRequest | undefined;
  const result=await runCampaignGeneration({fixtureId:fixture.id,values},{catalog,provider:{id:"local-test",label:"Instrumented local provider",async generate(r,opts){request=r; const proposal=await new LocalTestGenerationProvider().generate(r,opts) as Record<string,unknown>;return {...proposal,layout:"editorial-long-copy",sections:["hero","detail","close"]};}}});
  assert.ok(result.ok); assert.equal(request?.campaign.composition,"product-focus");
  assert.equal(result.preview.composition?.id,"product-focus");
  assert.equal(result.preview.draft.layout,"editorial-long-copy");
  assert.equal(result.preview.brief.offer,brief.offer);
});
test("invalid and timeout generation fallbacks keep the customer composition and protected values", async () => {
  const {fixture,catalog,values}=context();
  for (const mode of ["invalid","timeout"] as const) {
    const result=await runCampaignGeneration({fixtureId:fixture.id,values},{catalog,provider:new LocalTestGenerationProvider(mode),timeoutMs:20});
    assert.ok(result.ok); assert.equal(result.generation.status,"fallback");
    assert.equal(result.preview.composition?.id,"product-focus");
    assert.equal(result.preview.brief.offer,brief.offer);
    assert.equal(result.preview.asset.contentHash,"a".repeat(64));
  }
});


