import { BASE_CATALOG, getAsset } from "./fixtures.ts";
import { hashRevision } from "./template.ts";
import type { CampaignCatalog, ApprovedAsset } from "./types.ts";
import { storyRuntimeSource } from "./story-runtime.ts";

export const STORY_MODES = ["static", "instant", "motion"] as const;
export type StoryMode = typeof STORY_MODES[number];
export type StoryDefinition = {
  schemaVersion: 1;
  id: string;
  version: string;
  campaignId: string;
  presentation: "sequence";
  beats: readonly { copyId: string; factIds: readonly string[]; assetId: string; role: ApprovedAsset["role"]; label: string }[];
};
export const STORY_BEATS = [
  { copyId: "prototype-wall", factIds: ["body"], assetId: "morrow-prototype", role: "product-evidence", label: "First prototype" },
  { copyId: "rib-revision", factIds: ["interior"], assetId: "morrow-ribs", role: "product-detail", label: "Revised ribs" },
] as const;
export const STORY_DEFINITIONS: readonly StoryDefinition[] = [
  { schemaVersion: 1, id: "morrow-rib-story", version: "2.0.0", campaignId: "morrow-advertorial-full", presentation: "sequence", beats: STORY_BEATS },
  { schemaVersion: 1, id: "morrow-product-story", version: "1.0.0", campaignId: "morrow-advertorial-full", presentation: "sequence", beats: [...STORY_BEATS,
    { copyId: "product-transition", factIds: ["interior"], assetId: "morrow-pour", role: "product-in-use", label: "The finished dripper" }] },
];
export class StoryValidationError extends Error {}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const id = (value: unknown): value is string => text(value) && /^[a-z0-9][a-z0-9-]*$/.test(value);
export function validateStoryDefinition(value: unknown): asserts value is StoryDefinition {
  if (!record(value) || Object.keys(value).some(key => !["schemaVersion", "id", "version", "campaignId", "presentation", "beats"].includes(key)) || value.schemaVersion !== 1 || !id(value.id) || !text(value.version) || !/^\d+\.\d+\.\d+$/.test(value.version) || !id(value.campaignId) || value.presentation !== "sequence" || !Array.isArray(value.beats) || value.beats.length < 2 || value.beats.length > 3) throw new StoryValidationError("Story definition needs schemaVersion 1, registered IDs/version, sequence presentation and 2–3 approved beats.");
  const copies = new Set(), assets = new Set();
  for (const beat of value.beats) {
    if (!record(beat) || Object.keys(beat).some(key => !["copyId", "factIds", "assetId", "role", "label"].includes(key)) || !id(beat.copyId) || !id(beat.assetId) || !text(beat.label) || beat.label.length > 80 || !["product-evidence", "product-detail", "product-in-use"].includes(String(beat.role)) || !Array.isArray(beat.factIds) || beat.factIds.length === 0 || !beat.factIds.every(id) || new Set(beat.factIds).size !== beat.factIds.length || copies.has(beat.copyId) || assets.has(beat.assetId)) throw new StoryValidationError("Story beats need unique approved copy/asset IDs, fact IDs, source roles and bounded labels.");
    copies.add(beat.copyId); assets.add(beat.assetId);
  }
}
/** App-owned repository policy. Public image upload remains raster-only. */
export const STORY_REPOSITORY_SVGS = ["morrow-prototype", "morrow-ribs", "morrow-pour"].map(assetId => {
  const asset = getAsset(assetId)!;
  return { id: asset.id, src: asset.src, contentHash: asset.contentHash, role: asset.role };
});
export function isApprovedStorySvg(asset: ApprovedAsset): boolean {
  return STORY_REPOSITORY_SVGS.some(allowed => allowed.id === asset.id && allowed.src === asset.src && allowed.contentHash === asset.contentHash && allowed.role === asset.role);
}
export function resolveStory(catalog: CampaignCatalog = BASE_CATALOG, definition: StoryDefinition = STORY_DEFINITIONS[0]) {
  validateStoryDefinition(definition);
  const fixture = catalog.fixtures[definition.campaignId];
  const brief = fixture?.brief, material = brief?.advertorial;
  const brand = brief && catalog.brands[brief.brandId];
  if (!brief || !material || !brand || !text(brief.copy.headline) || !text(material.productTransition) || !text(material.disclosure.label) || !text(material.disclosure.explanation)) throw new StoryValidationError(`Missing approved campaign/source copy: ${definition.campaignId}`);
  const beats = definition.beats.map(beat => {
    const asset = getAsset(beat.assetId, catalog);
    const original = material.storyBeats.find(copy => copy.id === beat.copyId);
    const copy = beat.copyId === "product-transition"
      ? { id: beat.copyId, text: material.productTransition, source: brief.productFacts.find(fact => fact.id === beat.factIds[0])?.source }
      : original;
    if (!asset || !copy || !text(copy.text) || !copy.source?.document || !copy.source.reviewedBy || !copy.source.reviewedOn || (original && original.source.quote !== original.text) || asset.role !== beat.role || !asset.reviewed || asset.brandId !== brief.brandId || !asset.source || !asset.rights || !asset.reviewedBy || !asset.reviewedOn || !asset.alt || !/^[a-f0-9]{64}$/.test(asset.contentHash) || !Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0 || !/^\/(?:campaign-assets|campaign-lab-pilots)\/[a-z0-9/.-]+\.(?:svg|webp|png|jpg)$/.test(asset.src) || asset.src.includes("..") || (asset.src.endsWith(".svg") && !isApprovedStorySvg(asset)) || beat.factIds.some(id => !brief.productFacts.some(fact => fact.id === id && fact.source.document && fact.source.quote && fact.source.reviewedBy && fact.source.reviewedOn))) throw new StoryValidationError(`Missing approved story material/source role: ${beat.copyId} / ${beat.assetId}`);
    return { ...beat, copy, asset };
  });
  return { definition, brief, material, beats, brand };
}
export type ResolvedStory = ReturnType<typeof resolveStory>;
export type StorySource = { definition: StoryDefinition; catalog: CampaignCatalog };
/** Minimal reviewed catalog, synchronously deep-copied again by export capture. */
export function captureStorySource(catalog: CampaignCatalog, definition: StoryDefinition): StorySource {
  const story = resolveStory(catalog, definition);
  return JSON.parse(JSON.stringify({ definition, catalog: {
    brands: { [story.brand.id]: story.brand }, fixtures: { [definition.campaignId]: catalog.fixtures[definition.campaignId] }, assets: story.beats.map(beat => beat.asset),
  } }));
}
export const STORY_CSS = `
.product-story{background:var(--cp-page);color:var(--cp-ink);max-width:1120px;margin:auto;padding:clamp(20px,5vw,64px);font-family:Arial,sans-serif;line-height:1.55;box-sizing:border-box}
.product-story *{box-sizing:border-box}.product-story h1{font:400 clamp(32px,4.8vw,62px)/1.08 Georgia,serif;letter-spacing:-.03em;max-width:900px;margin:28px 0}.product-story h2{font:400 clamp(26px,3vw,38px)/1.15 Georgia,serif;margin:0 0 16px}.product-story p{max-width:65ch}
.story-panel{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(20px,4vw,48px);align-items:center;padding:24px 0;border-top:1px solid var(--cp-line)}
.story-panel img{display:block;width:100%;height:400px;object-fit:contain;background:var(--cp-surface);border-radius:12px}.story-panel figure{margin:0}.story-panel figcaption{font-size:13px;margin-top:8px;color:var(--cp-muted)}
.story-controls{display:flex;gap:8px;flex-wrap:wrap;margin:28px 0 8px}.story-controls[hidden]{display:none}.story-controls button,.story-cta{font:inherit;min-height:44px;padding:10px 20px;border:1px solid var(--cp-accent);border-radius:var(--cp-button-radius);color:var(--cp-accent);background:var(--cp-page);cursor:pointer}.story-controls button[aria-pressed=true],.story-cta{background:var(--cp-accent);color:var(--cp-accent-ink)}.product-story :focus-visible{outline:3px solid var(--cp-accent);outline-offset:4px}.story-cta{display:inline-block;text-decoration:none}.story-offer{border-top:1px solid var(--cp-line);margin-top:32px;padding-top:20px}.story-facts{display:flex;flex-wrap:wrap;gap:12px 32px;padding:0;list-style:none}
.story-enhanced .story-window{overflow:hidden}.story-enhanced .story-track{display:flex;width:calc(var(--story-count) * 100%);align-items:stretch}.story-enhanced .story-panel{width:calc(100% / var(--story-count));flex-shrink:0;align-content:start}.story-enhanced .story-panel>div{align-self:center}
@media(max-width:600px){.story-panel{grid-template-columns:1fr;gap:20px}.story-panel img{height:260px}.story-enhanced .story-panel>div{align-self:start}.story-controls button{padding:10px 12px}.product-story h1{margin-top:20px}}
@media(prefers-reduced-motion:reduce){.story-track{transition:none!important}}
`;

export function storyConfiguration(mode: StoryMode, definition: StoryDefinition = STORY_DEFINITIONS[0]) {
  validateStoryDefinition(definition);
  if (!STORY_MODES.includes(mode)) throw new StoryValidationError("Unknown story mode.");
  return { id: definition.id, version: definition.version, mode, beats: definition.beats,
    definitionIdentity: hashRevision(JSON.stringify(definition)),
    runtimeIdentity: hashRevision(STORY_CSS + storyRuntimeSource()), durationMs: mode === "motion" ? 250 : 0 };
}
export type StoryConfiguration = ReturnType<typeof storyConfiguration>;
export function assertCurrentStory(config: StoryConfiguration, definition = STORY_DEFINITIONS.find(item => item.id === config.id)) {
  if (!definition || JSON.stringify(config) !== JSON.stringify(storyConfiguration(config.mode, definition))) throw new StoryValidationError("Story configuration/runtime changed; approve a fresh revision.");
}
export function storyRevision(mode: StoryMode, catalog: CampaignCatalog = BASE_CATALOG, definition: StoryDefinition = STORY_DEFINITIONS[0]) {
  return hashRevision(JSON.stringify({ schema: "product-story@2", content: resolveStory(catalog, definition), configuration: storyConfiguration(mode, definition) }));
}
