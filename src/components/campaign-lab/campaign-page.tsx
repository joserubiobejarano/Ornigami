import Image from "next/image";
import type { CSSProperties } from "react";

import type { CampaignBrief, ProductFact, ResolvedBrandTheme, TemplateDraft } from "@/lib/campaign-lab/types";

import styles from "./campaign-page.module.css";

type CampaignPageProps = {
  brief: CampaignBrief;
  draft: TemplateDraft;
  asset: {
    src: string;
    width: number;
    height: number;
    alt: string;
  };
  theme: ResolvedBrandTheme;
  headingId: string;
  previewLabel?: string;
};

function FactList({ facts, className }: { facts: ProductFact[]; className?: string }) {
  return (
    <ul className={className}>
      {facts.map((fact) => (
        <li
          key={fact.id}
          className={styles.fact}
          data-fact-id={fact.id}
          data-fact-source={fact.source.quote}
        >
          <span className={styles.factLabel}>{fact.label}</span>
          <span className={styles.factValue}>{fact.value}</span>
        </li>
      ))}
    </ul>
  );
}

function ProductLabel({ productName }: { productName: string }) {
  return <p className={styles.productLabel}>{productName}</p>;
}

function Offer({ offer }: { offer: string }) {
  return (
    <div className={styles.offer}>
      <p className={styles.offerLabel}>Offer</p>
      <p className={styles.offerText}>{offer}</p>
    </div>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <a className={styles.action} href={href} target="_blank" rel="nofollow noopener noreferrer">
      {label}
      <span className={styles.srOnly}> (opens in a new tab)</span>
    </a>
  );
}

export function CampaignPage({ brief, draft, asset, theme, headingId, previewLabel }: CampaignPageProps) {
  const { tokens } = theme;
  const isEditorial = draft.layout === "editorial-long-copy";
  const showHeroFacts = draft.sections.includes("hero-facts");
  const showDetail = draft.sections.includes("detail");
  const isProductFirst = tokens.heroOrder === "product-first";
  const showProductLabel = !draft.headline
    .toLowerCase()
    .includes(brief.productName.toLowerCase());

  const style = {
    "--cp-page": tokens.page,
    "--cp-surface": tokens.surface,
    "--cp-ink": tokens.ink,
    "--cp-muted": tokens.muted,
    "--cp-accent": tokens.accent,
    "--cp-accent-ink": tokens.accentInk,
    "--cp-line": tokens.line,
    "--cp-display-font": tokens.displayFont,
    "--cp-body-font": tokens.bodyFont,
    "--cp-display-weight": String(tokens.displayWeight),
    "--cp-display-tracking": tokens.displayTracking,
    "--cp-label-case": tokens.labelCase,
    "--cp-label-tracking": tokens.labelTracking,
    "--cp-image-radius": tokens.imageRadius,
    "--cp-button-radius": tokens.buttonRadius,
    "--cp-detail-bg": tokens.detailBackground,
    "--cp-detail-ink": tokens.detailInk,
    "--cp-image-blend": tokens.imageBlend,
  } as CSSProperties;

  const image = (
    <figure className={styles.imageFrame}>
      <Image
        className={styles.image}
        src={asset.src}
        alt={asset.alt}
        width={asset.width}
        height={asset.height}
        unoptimized
        priority
      />
    </figure>
  );

  return (
    <article
      className={[
        styles.page,
        isEditorial ? styles.editorial : styles.offerLed,
        isProductFirst ? styles.productFirst : styles.headlineFirst,
        tokens.heroImage === "arch" ? styles.arch : styles.framed,
      ].join(" ")}
      style={style}
      aria-labelledby={headingId}
    >
      <header className={styles.masthead}>
        <p className={styles.wordmark}>
          {tokens.showWordmarkMark ? <span className={styles.mark} aria-hidden="true" /> : null}
          {theme.brand.wordmark}
        </p>
      </header>

      <div>
        {isEditorial ? (
          <section className={styles.editorialHero}>
            <div className={styles.editorialHeading}>
              {showProductLabel ? <ProductLabel productName={brief.productName} /> : null}
              <h1 id={headingId} className={styles.headline}>
                {draft.headline}
              </h1>
            </div>
            <div className={styles.editorialBody}>
              {image}
              <div className={styles.editorialSupport}>
                <p className={styles.lede}>{draft.lede}</p>
                <Offer offer={brief.offer} />
                <Action href={brief.destinationUrl} label={brief.actionLabel} />
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.offerHero}>
            <div className={styles.copy}>
              {showProductLabel ? <ProductLabel productName={brief.productName} /> : null}
              <h1 id={headingId} className={styles.headline}>
                {draft.headline}
              </h1>
              <p className={styles.lede}>{draft.lede}</p>
              {showHeroFacts ? <FactList facts={draft.facts} className={styles.facts} /> : null}
              <Offer offer={brief.offer} />
              <Action href={brief.destinationUrl} label={brief.actionLabel} />
            </div>
            {image}
          </section>
        )}

        {isEditorial && showDetail ? (
          <section className={styles.detail} aria-labelledby="campaign-detail-heading">
            <div className={styles.detailGrid}>
              <div className={styles.detailCopy}>
                <h2 id="campaign-detail-heading" className={styles.detailTitle}>
                  {theme.brand.detailTitle}
                </h2>
              </div>
              <FactList facts={draft.facts} className={styles.detailFacts} />
            </div>
          </section>
        ) : null}

        <section className={styles.close} aria-labelledby="campaign-close-heading">
          <div className={styles.closeCopy}>
            <h2 id="campaign-close-heading" className={styles.closeTitle}>
              {brief.productName}
            </h2>
          </div>
          <div className={styles.closeAction}>
            <Action href={brief.destinationUrl} label={brief.actionLabel} />
            <p className={styles.closeOffer}>{brief.offer}</p>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>{theme.brand.wordmark}</span>
        {previewLabel ? <span className={styles.previewLabel}>{previewLabel}</span> : null}
        <span>© 2026 {theme.brand.name}</span>
      </footer>
    </article>
  );
}
