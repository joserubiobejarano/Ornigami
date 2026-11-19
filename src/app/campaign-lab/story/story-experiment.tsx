"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { resolveStory, storyConfiguration, storyRevision, STORY_CSS, STORY_MODES } from "@/lib/campaign-lab/story";
import type { StoryMode } from "@/lib/campaign-lab/story";
import type { CampaignCatalog } from "@/lib/campaign-lab/types";
import { initializeStory } from "@/lib/campaign-lab/story-runtime";
import { captureCampaignExportSnapshot, buildCampaignExportBundle, downloadCampaignExport } from "@/lib/campaign-lab/export";
import type { LocalPreviewApprovalInput } from "@/lib/campaign-lab/export";

export function StoryExperiment({ mode, catalog }: { mode: StoryMode; catalog: CampaignCatalog }) {
  const story = resolveStory(catalog);
  const revision = storyRevision(mode, catalog);
  const article = useRef<HTMLElement>(null);
  const [approval, setApproval] = useState<{ revision: string; approvedAt: string } | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef<LocalPreviewApprovalInput>({ revision, approvalRevision: null, dirty: false, generating: false, imagesReady: false });
  function approve(value: {revision: string; approvedAt: string} | null) {
    guard.current = { ...guard.current, approvalRevision: value?.revision };
    setApproval(value);
  }
  useEffect(() => {
    if (!article.current) return;
    return initializeStory(article.current, mode);
  }, [mode]);
  function checkImages() {
    const images = Array.from(article.current?.querySelectorAll("img") ?? []);
    const ready = images.length === story.beats.length && images.every(image => image.complete && image.naturalWidth > 0);
    guard.current = { ...guard.current, imagesReady: ready };
    setImagesReady(ready);
    if (images.some(image => image.complete && !image.naturalWidth)) { approve(null); setMessage("A story illustration could not load. The complete text remains readable; reload before approving."); }
  }
  useEffect(() => {
    const images = Array.from(article.current?.querySelectorAll("img") ?? []);
    if (images.length && images.every(image => image.complete && image.naturalWidth > 0)) { guard.current.imagesReady = true; setImagesReady(true); }
  }, []);
  async function exportPage() {
    if (!article.current || !approval) return;
    setBusy(true);
    try {
      const first = story.beats[0].asset;
      const snapshot = captureCampaignExportSnapshot({ article: article.current, approval, guard: guard.current, preview: {
        revision, revisionIdentityVersion: 1, status: "preview", notice: "Fictional campaign. Synthetic illustrations, not experimental proof.",
        story: storyConfiguration(mode), assets: story.beats.map(beat => beat.asset),
        asset: first, productName: story.brief.productName, brandName: story.brand.name, offer: story.brief.offer,
        destinationUrl: story.brief.destinationUrl, actionLabel: story.brief.actionLabel,
        template: { id: "product-story", version: "1.0.0", layout: "two-beat", sections: ["opening", "story", "facts", "offer"] },
      } });
      const bundle = await buildCampaignExportBundle(snapshot, { isStillApproved: expected => JSON.stringify(expected) === JSON.stringify(guard.current) });
      downloadCampaignExport(bundle);
      setMessage("Approved local export ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(false); }
  }
  const tokens = story.brand.tokens;
  const style = Object.fromEntries(Object.entries({ page: tokens.page, surface: tokens.surface, ink: tokens.ink, muted: tokens.muted, accent: tokens.accent, "accent-ink": tokens.accentInk, line: tokens.line, "button-radius": tokens.buttonRadius }).map(([key,value]) => [`--cp-${key}`, value])) as CSSProperties;
  return <main style={{ background: tokens.page, minHeight: "100vh", padding: "16px" }}>
    <style>{STORY_CSS}</style>
    <nav aria-label="Compare story variants" style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: 12 }}>
      {STORY_MODES.map(value => <a key={value} href={`?mode=${value}`} aria-current={mode === value ? "page" : undefined}>{value}</a>)}
    </nav>
    <section aria-label="Local preview approval" style={{ padding: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button disabled={!imagesReady || Boolean(approval)} onClick={() => approve({ revision, approvedAt: new Date().toISOString() })}>Approve local preview</button>
      <button disabled={!approval || !imagesReady || busy} onClick={exportPage}>Export approved ZIP</button>
      <button disabled={!approval} onClick={() => approve(null)}>Revoke approval</button>
      <span role="status">{message || (approval ? "Locally approved" : "Local preview — approval required")}</span>
    </section>
    <article ref={article} className="product-story" style={style}>
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
          <div><h2 id={`story-heading-${index}`}>{beat.label}</h2><p>{beat.copy.text}</p>{index === 1 && <p>{story.material.productTransition}</p>}</div>
        </section>)}
      </div></div>
      <ul className="story-facts">{story.brief.productFacts.map(fact => <li key={fact.id}>{fact.label}: {fact.value}</li>)}</ul>
      <footer className="story-offer"><p>{story.brief.productName}</p><p>{story.brief.offer}</p><a className="story-cta" href={story.brief.destinationUrl}>{story.brief.actionLabel}</a></footer>
    </article>
  </main>;
}
