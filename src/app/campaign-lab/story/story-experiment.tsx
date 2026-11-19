"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { resolveStory, captureStorySource, storyConfiguration, storyRevision, STORY_CSS, STORY_MODES, STORY_DEFINITIONS } from "@/lib/campaign-lab/story";
import type { StoryMode } from "@/lib/campaign-lab/story";
import type { CampaignCatalog } from "@/lib/campaign-lab/types";
import { initializeStory } from "@/lib/campaign-lab/story-runtime";
import { captureCampaignExportSnapshot, downloadCampaignExport, evaluateCampaignExport, isLocalPreviewApproved } from "@/lib/campaign-lab/export";
import { usePreviewReview } from "@/components/campaign-lab/use-preview-review";
import { summarizeRequiredPreviewImages, recordPreviewImageEvent } from "@/lib/campaign-lab/editor";

export function StoryExperiment({ mode: initialMode, catalog, definitionId }: { mode: StoryMode; catalog: CampaignCatalog; definitionId: string }) {
  const [mode, setMode] = useState(initialMode);
  const [selectedDefinition, setDefinition] = useState(definitionId);
  const definition = STORY_DEFINITIONS.find(item => item.id === selectedDefinition)!;
  const story = resolveStory(catalog, definition);
  const revision = storyRevision(mode, catalog, definition);
  const article = useRef<HTMLElement>(null);
  const review = usePreviewReview(revision);
  const { approval, setApproval, imageGate, setImageGate, exporting: busy, approvalGuardRef: guard } = review;
  const [message, setMessage] = useState("");
  const summary = summarizeRequiredPreviewImages(revision, story.beats.map(beat => beat.asset.id), imageGate);
  guard.current = { revision, approvalRevision: approval?.revision, dirty: false, generating: false, imagesReady: summary.ready };
  const approved = isLocalPreviewApproved(guard.current);
  const canExport = evaluateCampaignExport({ ...guard.current, supportedFormat: true }).ok && !busy;
  useEffect(() => {
    if (!article.current) return;
    return initializeStory(article.current, mode);
  }, [mode, revision]);
  function change(change: () => void) { setApproval(null); guard.current = { ...guard.current, dirty: true }; setMessage(""); change(); }
  function checkImages() {
    if (article.current?.dataset.revision !== revision) return;
    const images = Array.from(article.current?.querySelectorAll("img") ?? []);
    for (const image of images) {
      const assetId = image.getAttribute("data-approved-asset-id");
      if (!assetId || !image.complete) continue;
      const status = image.naturalWidth > 0 ? "loaded" : "error";
      setImageGate(current => recordPreviewImageEvent(current, { revision, assetId, attempt: 0, status }));
      if (status === "error") { setApproval(null); setMessage("A required illustration failed. Complete text remains readable. Restore the image and reload before approving."); }
    }
  }
  // Cached images can finish before React attaches load handlers.
  useEffect(() => { checkImages(); }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps
  async function exportPage() {
    if (!article.current || !approval) return;
    try {
      const first = story.beats[0].asset;
      const snapshot = captureCampaignExportSnapshot({ article: article.current, approval, guard: guard.current, preview: {
        revision, revisionIdentityVersion: 2, status: "preview", notice: "Fictional campaign. Synthetic illustrations, not experimental proof.",
        storySource: captureStorySource(catalog, definition), story: storyConfiguration(mode, definition), assets: story.beats.map(beat => beat.asset),
        asset: first, productName: story.brief.productName, brandName: story.brand.name, offer: story.brief.offer,
        destinationUrl: story.brief.destinationUrl, actionLabel: story.brief.actionLabel,
        template: { id: "product-story", version: "2.0.0", layout: `${story.beats.length}-beat`, sections: ["opening", "story", "facts", "offer"] },
      } });
      const bundle = await review.prepareExport(snapshot);
      downloadCampaignExport(bundle);
      setMessage("Approved local export ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed."); }
  }
  const tokens = story.brand.tokens;
  const style = Object.fromEntries(Object.entries({ page: tokens.page, surface: tokens.surface, ink: tokens.ink, muted: tokens.muted, accent: tokens.accent, "accent-ink": tokens.accentInk, line: tokens.line, "button-radius": tokens.buttonRadius }).map(([key,value]) => [`--cp-${key}`, value])) as CSSProperties;
  return <main style={{ background: tokens.page, minHeight: "100vh", padding: "16px" }}>
    <style>{STORY_CSS}</style>
    <nav aria-label="Compare story variants" style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: 12 }}>
      <label>Story definition <select value={selectedDefinition} onChange={event => change(() => setDefinition(event.target.value))}>{STORY_DEFINITIONS.map(item => <option key={item.id} value={item.id}>{item.id} ({item.beats.length} beats)</option>)}</select></label>
      {STORY_MODES.map(value => <button key={value} onClick={() => change(() => setMode(value))} aria-pressed={mode === value}>{value}</button>)}
    </nav>
    <section aria-label="Local preview approval" style={{ padding: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button disabled={!summary.ready || approved} onClick={review.approve}>Approve local preview</button>
      <button disabled={!canExport} onClick={exportPage}>Export approved ZIP</button>
      <button disabled={!approval} onClick={() => setApproval(null)}>Revoke approval</button>
      <span role="status">{message || (approved ? "Locally approved" : "Local preview — approval required")}</span>
    </section>
    <article key={revision} ref={article} className="product-story" data-revision={revision} data-definition={definition.id} data-mode={mode} data-ready-images={story.beats.length - summary.pendingAssetIds.length} data-approved={approved} style={style}>
      <p>{story.material.disclosure.label} · {story.brand.name}</p>
      <h1>{story.brief.copy.headline}</h1>
      <p>{story.material.disclosure.explanation}</p>
      <div className="story-controls" hidden aria-label="Story steps">
        {story.beats.map((beat, index) => <button key={beat.copyId} type="button" aria-controls={`story-panel-${index}`} aria-pressed="false">{index + 1}. {beat.label}</button>)}
      </div>
      <div className="story-window"><div className="story-track">
        {story.beats.map((beat, index) => <section className="story-panel" id={`story-panel-${index}`} key={beat.copyId} aria-labelledby={`story-heading-${index}`}>
          {/* Approved external SVG stays an img in standalone exports. */}
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-approved-asset-id={beat.asset.id} src={beat.asset.src} alt={beat.asset.alt} width={beat.asset.width} height={beat.asset.height} onLoad={checkImages} onError={checkImages} /><figcaption>{beat.asset.caption}</figcaption></figure>
          <div><h2 id={`story-heading-${index}`}>{beat.label}</h2><p>{beat.copy.text}</p>{index === story.beats.length - 1 && !story.beats.some(beat => beat.copyId === "product-transition") && <p>{story.material.productTransition}</p>}</div>
        </section>)}
      </div></div>
      <ul className="story-facts">{story.brief.productFacts.map(fact => <li key={fact.id}>{fact.label}: {fact.value}</li>)}</ul>
      <footer className="story-offer"><p>{story.brief.productName}</p><p>{story.brief.offer}</p><a className="story-cta" href={story.brief.destinationUrl}>{story.brief.actionLabel}</a></footer>
    </article>
  </main>;
}
