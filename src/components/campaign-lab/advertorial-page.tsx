import Image from "next/image";
import type { CSSProperties } from "react";

import type { AdvertorialResolvedAsset } from "@/lib/campaign-lab/advertorial";
import type {
  AdvertorialBrief,
  AdvertorialDraft,
  ProductFact,
  ResolvedBrandTheme,
} from "@/lib/campaign-lab/types";

import styles from "./advertorial-page.module.css";

type AdvertorialPageProps = {
  brief: AdvertorialBrief;
  draft: AdvertorialDraft;
  assets: AdvertorialResolvedAsset[];
  theme: ResolvedBrandTheme;
  headingId: string;
  previewLabel?: string;
};

function FactList({ facts, className }: { facts: ProductFact[]; className?: string }) {
  return (
    <ul className={className} aria-label="Product facts">
      {facts.map((fact) => (
        <li
          key={fact.id}
          className={styles.fact}
          data-fact-id={fact.id}
          data-fact-label={fact.label}
          data-fact-source={fact.source.quote}
        >
          <span className={styles.srOnly}>{fact.label}: </span>
          <span className={styles.factValue}>{fact.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Offer({ offer }: { offer: string }) {
  return (
    <div className={styles.offer} data-role="offer">
      <p className={styles.offerText}>{offer}</p>
    </div>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <a
      className={styles.action}
      data-role="action"
      data-advertorial-action
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
    >
      {label}
      <span className={styles.srOnly}> (opens in a new tab)</span>
    </a>
  );
}

function Figure({
  asset,
  className,
  imageClassName,
  caption,
  priority = false,
  contain = false,
}: {
  asset: AdvertorialResolvedAsset;
  className: string;
  imageClassName?: string;
  caption?: string;
  priority?: boolean;
  contain?: boolean;
}) {
  return (
    <figure
      className={className}
      data-asset-id={asset.asset.id}
      data-asset-role={asset.assignment.role}
    >
      <Image
        className={[styles.image, contain ? styles.containImage : null, imageClassName]
          .filter(Boolean)
          .join(" ")}
        src={asset.asset.src}
        alt={asset.asset.alt}
        width={asset.asset.width}
        height={asset.asset.height}
        unoptimized
        priority={priority}
      />
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

export function AdvertorialPage({
  brief,
  draft,
  assets,
  theme,
  headingId,
  previewLabel,
}: AdvertorialPageProps) {
  const { tokens } = theme;
  const byRole = (role: AdvertorialResolvedAsset["assignment"]["role"]) =>
    assets.find((entry) => entry.assignment.role === role);
  const hero = byRole("product-hero");
  const prototype = byRole("product-evidence");
  const detail = byRole("product-detail");
  const showEvidence = draft.sections.includes("evidence");
  const storyFigures = showEvidence ? [undefined, detail] : [prototype, detail];

  const style = {
    "--ad-page": tokens.page,
    "--ad-surface": tokens.surface,
    "--ad-ink": tokens.ink,
    "--ad-muted": tokens.muted,
    "--ad-accent": tokens.accent,
    "--ad-accent-ink": tokens.accentInk,
    "--ad-line": tokens.line,
    "--ad-display-font": tokens.displayFont,
    "--ad-body-font": tokens.bodyFont,
    "--ad-display-weight": String(tokens.displayWeight),
    "--ad-display-tracking": tokens.displayTracking,
    "--ad-label-case": tokens.labelCase,
    "--ad-label-tracking": tokens.labelTracking,
    "--ad-image-radius": tokens.imageRadius,
    "--ad-button-radius": tokens.buttonRadius,
    "--ad-detail-bg": tokens.detailBackground,
    "--ad-detail-ink": tokens.detailInk,
    "--ad-image-blend": tokens.imageBlend,
  } as CSSProperties;

  return (
    <article
      className={[
        styles.page,
        draft.layout === "advertorial-full" ? styles.full : styles.onePhoto,
      ].join(" ")}
      style={style}
      aria-labelledby={headingId}
      data-advertorial-page
    >
      <div className={styles.topbar}>
        <div
          className={styles.disclosure}
          data-advertorial-section="disclosure"
          role="note"
          aria-label="Sponsorship disclosure"
        >
          <p className={styles.disclosureLine}>
            <span className={styles.wordmark}>
              {tokens.showWordmarkMark ? <span className={styles.mark} aria-hidden="true" /> : null}
              {theme.brand.wordmark}
            </span>
            <span className={styles.disclosureLabel}>{draft.disclosure.label}</span>
          </p>
          <p className={styles.disclosureExplanation}>{draft.disclosure.explanation}</p>
        </div>
      </div>

      <section className={styles.opening} data-advertorial-section="opening">
        <h1 id={headingId} className={styles.headline}>
          {draft.headline}
        </h1>
        <p className={styles.standfirst}>{draft.standfirst}</p>
      </section>

      <section className={styles.story} data-advertorial-section="story">
        <div className={styles.storyGrid}>
          {draft.story.map((beat, index) => {
            const figure = storyFigures[index];
            return (
              <div
                key={beat.id}
                className={[styles.storyRow, figure ? null : styles.storyRowTextOnly]
                  .filter(Boolean)
                  .join(" ")}
              >
                <p
                  className={styles.storyBeat}
                  data-story-beat-id={beat.id}
                  data-story-beat-source={beat.source.quote}
                >
                  {beat.text}
                </p>
                {figure ? (
                  <Figure
                    asset={figure}
                    className={styles.storyFigure}
                    priority={index === 0}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {showEvidence ? (
        <section className={styles.evidence} data-advertorial-section="evidence">
          <div className={styles.evidenceGrid}>
            <FactList facts={draft.facts} className={styles.facts} />
            {prototype ? <Figure asset={prototype} className={styles.evidenceImage} /> : null}
          </div>
        </section>
      ) : null}

      <section className={styles.product} data-advertorial-section="product">
        <div className={styles.productIntro}>
          <h2 className={styles.productName}>{brief.productName}</h2>
          <p className={styles.productTransition}>{draft.productTransition}</p>
          {!showEvidence ? (
            <FactList facts={draft.facts} className={styles.productFacts} />
          ) : null}
        </div>
        {hero ? (
          <Figure
            asset={hero}
            className={styles.productHero}
            priority={draft.layout === "advertorial-one-photo"}
            contain
          />
        ) : null}
        <div className={styles.productAction}>
          <Offer offer={brief.offer} />
          <Action href={brief.destinationUrl} label={brief.actionLabel} />
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 {theme.brand.name}</span>
        {previewLabel ? <span className={styles.previewLabel}>{previewLabel}</span> : null}
      </footer>
    </article>
  );
}
