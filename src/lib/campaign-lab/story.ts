import { BASE_CATALOG, CAMPAIGN_FIXTURES, getAsset } from "./fixtures.ts";
import { hashRevision } from "./template.ts";
import type { CampaignCatalog } from "./types.ts";
import { storyRuntimeSource } from "./story-runtime.ts";

export const STORY_MODES = ["static", "instant", "motion"] as const;
export type StoryMode = typeof STORY_MODES[number];
export const STORY_BEATS = [
  { copyId: "prototype-wall", factIds: ["body"], assetId: "morrow-prototype", role: "product-evidence", label: "First prototype" },
  { copyId: "rib-revision", factIds: ["interior"], assetId: "morrow-ribs", role: "product-detail", label: "Revised ribs" },
] as const;

export const STORY_CSS = `
.product-story{background:var(--cp-page);color:var(--cp-ink);max-width:1120px;margin:auto;padding:clamp(20px,5vw,64px);font-family:Arial,sans-serif;line-height:1.55;box-sizing:border-box}
.product-story *{box-sizing:border-box}.product-story h1{font:400 clamp(32px,4.8vw,62px)/1.08 Georgia,serif;letter-spacing:-.03em;max-width:900px;margin:28px 0}.product-story h2{font:400 clamp(26px,3vw,38px)/1.15 Georgia,serif;margin:0 0 16px}.product-story p{max-width:65ch}
.story-panel{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(20px,4vw,48px);align-items:center;padding:24px 0;border-top:1px solid var(--cp-line)}
.story-panel img{display:block;width:100%;height:400px;object-fit:contain;background:var(--cp-surface);border-radius:12px}.story-panel figure{margin:0}.story-panel figcaption{font-size:13px;margin-top:8px;color:var(--cp-muted)}
.story-controls{display:flex;gap:8px;flex-wrap:wrap;margin:28px 0 8px}.story-controls[hidden]{display:none}.story-controls button,.story-cta{font:inherit;min-height:44px;padding:10px 20px;border:1px solid var(--cp-accent);border-radius:var(--cp-button-radius);color:var(--cp-accent);background:var(--cp-page);cursor:pointer}.story-controls button[aria-pressed=true],.story-cta{background:var(--cp-accent);color:var(--cp-accent-ink)}.product-story :focus-visible{outline:3px solid var(--cp-accent);outline-offset:4px}.story-cta{display:inline-block;text-decoration:none}.story-offer{border-top:1px solid var(--cp-line);margin-top:32px;padding-top:20px}.story-facts{display:flex;flex-wrap:wrap;gap:12px 32px;padding:0;list-style:none}
.story-enhanced .story-window{overflow:hidden}.story-enhanced .story-track{display:flex;width:200%;align-items:stretch}.story-enhanced .story-panel{width:50%;flex-shrink:0;align-content:start}.story-enhanced .story-panel>div{align-self:center}
@media(max-width:600px){.story-panel{grid-template-columns:1fr;gap:20px}.story-panel img{height:260px}.story-enhanced .story-panel>div{align-self:start}.story-controls button{padding:10px 12px}.product-story h1{margin-top:20px}}
@media(prefers-reduced-motion:reduce){.story-track{transition:none!important}}
`;

export function storyConfiguration(mode: StoryMode) {
  if (!STORY_MODES.includes(mode)) throw new Error("Unknown story mode.");
  return { id: "morrow-rib-story", version: "1.0.0", mode, beats: STORY_BEATS,
    runtimeIdentity: hashRevision(STORY_CSS + storyRuntimeSource()), durationMs: mode === "motion" ? 250 : 0 };
}
export type StoryConfiguration = ReturnType<typeof storyConfiguration>;
export function assertCurrentStory(config: StoryConfiguration) {
  if (JSON.stringify(config) !== JSON.stringify(storyConfiguration(config.mode))) throw new Error("Story configuration/runtime changed; approve a fresh revision.");
}
export function resolveStory(catalog: CampaignCatalog = BASE_CATALOG) {
  const fixture = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const brief = fixture.brief;
  const material = brief.advertorial!;
  const beats = STORY_BEATS.map(beat => {
    const asset = getAsset(beat.assetId, catalog);
    const copy = material.storyBeats.find(copy => copy.id === beat.copyId);
    if (!asset || !copy || asset.role !== beat.role || !asset.reviewed || asset.brandId !== brief.brandId || !asset.source || !asset.rights || beat.factIds.some(id => !brief.productFacts.some(fact => fact.id === id))) throw new Error(`Missing approved story material: ${beat.copyId}`);
    return { ...beat, copy, asset };
  });
  return { brief, material, beats, brand: catalog.brands[brief.brandId] };
}
export function storyRevision(mode: StoryMode, catalog: CampaignCatalog = BASE_CATALOG) {
  return hashRevision(JSON.stringify({ schema: "product-story@1", content: resolveStory(catalog), configuration: storyConfiguration(mode) }));
}
