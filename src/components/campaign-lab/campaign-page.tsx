"use client";

import { resolveCampaignComposition } from "@/lib/campaign-lab/composition";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { initializeCampaignMotion } from "@/lib/campaign-lab/motion-runtime";
import { MOTION_CSS } from "@/lib/campaign-lab/motion";
import type { MotionPresentation } from "@/lib/campaign-lab/motion";

import type {
  PreviewImageEvent,
  PreviewImageStatus,
} from "@/lib/campaign-lab/editor";
import { findApprovedOfferPrice } from "@/lib/campaign-lab/offer-emphasis";
import {
  showsProductLabel,
  shouldShowClose,
  resolveCampaignImage,
} from "@/lib/campaign-lab/presentation";
import type { CampaignBrief, ProductFact, ResolvedBrandTheme, TemplateDraft } from "@/lib/campaign-lab/types";

import styles from "./campaign-page.module.css";
import { PreviewImage } from "./preview-image";

type CampaignPageProps = {
  motion?: MotionPresentation;
  brief: CampaignBrief;
  draft: TemplateDraft;
  asset: {
    role?: "product-hero" | "story-opening" | "product-detail" | "product-in-use" | "product-evidence";
    imageFit?: "contain" | "cover";
    id: string;
    src: string;
    width: number;
    height: number;
    alt: string;
  };
  theme: ResolvedBrandTheme;
  headingId: string;
  previewLabel?: string;
  imageRevision: string;
  imageStatus: PreviewImageStatus;
  imageAttempt: number;
  onImageStateChange: (event: PreviewImageEvent) => void;
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

function Offer({
  offer,
  approvedPrice,
  emphasizePrice = false,
}: {
  offer: string;
  approvedPrice?: string;
  emphasizePrice?: boolean;
}) {
  const price = emphasizePrice
    ? findApprovedOfferPrice(offer, approvedPrice)
    : null;
  const content = price ? (
    <>
      {offer.slice(0, price.start)}
      <span className={styles.offerPrice}>{price.text}</span>
      {offer.slice(price.end)}
    </>
  ) : (
    offer
  );

  return (
    <div className={styles.offer} data-role="offer">
      <p className={styles.offerText}>{content}</p>
    </div>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <a className={styles.action} data-role="action" href={href} target="_blank" rel="nofollow noopener noreferrer">
      {label}
      <span className={styles.srOnly}> (opens in a new tab)</span>
    </a>
  );
}

export function CampaignPage({
  motion,
  brief,
  draft,
  asset,
  theme,
  headingId,
  previewLabel,
  imageRevision,
  imageStatus,
  imageAttempt,
  onImageStateChange,
}: CampaignPageProps) {
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (articleRef.current && motion?.recipe && motion.recipe !== "none") {
      return initializeCampaignMotion(articleRef.current, motion.recipe);
    }
  }, [imageRevision, motion?.recipe, motion?.runtimeIdentity]);
  const { tokens } = theme;
  const imagePresentation = resolveCampaignImage(asset, tokens);
  const isEditorial = draft.layout === "editorial-long-copy";
  const showHeroFacts = draft.sections.includes("hero-facts");
  const showDetail = draft.sections.includes("detail");
  const isProductFirst = tokens.heroOrder === "product-first";
  const composition = resolveCampaignComposition(brief, asset);
  const isProductSecond = Boolean(composition) || tokens.mobileHeroOrder === "product-second";
  const usesBlendedImage = Boolean(tokens.imageBlend && tokens.imageBlend !== "normal");
  const usesEditorialOffer = tokens.offerStyle === "editorial";
  const usesPriceEmphasis = Boolean(tokens.offerPriceEmphasis);
  const showProductLabel = showsProductLabel(brief, draft);
  const showClose = shouldShowClose(brief, draft);

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
    "--cp-image-fit": imagePresentation.fit,
    "--cp-image-max-height": imagePresentation.frame === "natural-arch" ? "none" : "330px",
    "--cp-image-inset": tokens.imageInset ?? "0px",
    "--cp-button-radius": tokens.buttonRadius,
    "--cp-image-ratio": String(asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 1),
    "--cp-image-aspect": asset.width > 0 && asset.height > 0 ? `${asset.width} / ${asset.height}` : "4 / 5",
    "--cp-detail-bg": tokens.detailBackground,
    "--cp-detail-ink": tokens.detailInk,
    "--cp-image-blend": tokens.imageBlend,
  } as CSSProperties;

  const image = (
    <figure
      key={`${asset.id}:${imageRevision}:${imageAttempt}`}
      className={styles.imageFrame}
      data-asset-id={asset.id}
      data-image-status={imageStatus}
      data-image-attempt={imageAttempt}
    >
      <PreviewImage
        className={styles.image}
        src={asset.src}
        alt={asset.alt}
        width={asset.width}
        height={asset.height}
        unoptimized
        priority
        assetId={asset.id}
        revision={imageRevision}
        attempt={imageAttempt}
        onStateChange={onImageStateChange}
      />
    </figure>
  );

  const productLabel = showProductLabel ? (
    <ProductLabel productName={brief.productName} />
  ) : null;
  const headline = (
    <div className={styles.headlineMeasure}>
      <h1 id={headingId} className={styles.headline}>
        {draft.headline}
      </h1>
    </div>
  );
  const lede = brief.copy.hideLede ? null : (
    <p className={styles.lede} data-role="lede">
      {draft.lede}
    </p>
  );
  const offer = (
    <Offer
      offer={brief.offer}
      approvedPrice={brief.offerPrice}
      emphasizePrice={usesPriceEmphasis}
    />
  );
  const action = <Action href={brief.destinationUrl} label={brief.actionLabel} />;
  const facts = showHeroFacts ? (
    <FactList facts={draft.facts} className={styles.facts} />
  ) : null;

  return (
    <article
      ref={articleRef}
      className={[
        styles.page,
        isEditorial ? styles.editorial : styles.offerLed,
        isProductFirst && !composition ? styles.productFirst : styles.headlineFirst,
        tokens.heroImage === "arch" ? styles.arch : styles.framed,
        usesBlendedImage ? styles.blendedImage : null,
        usesEditorialOffer ? styles.offerEditorial : null,
        isProductSecond ? styles.productSecond : null,
        composition?.containedPackshot ? styles.productPackshot : null,
      ].join(" ")}
      style={style}
      data-composition={composition?.id}
      data-composition-version={composition?.version}
      aria-labelledby={headingId}
    >
      {motion?.recipe && motion.recipe !== "none" ? <style data-ornigami-motion-style="true">{MOTION_CSS}</style> : null}
      <header className={styles.masthead}>
        <p className={styles.wordmark}>
          {tokens.showWordmarkMark ? <span className={styles.mark} aria-hidden="true" /> : null}
          {theme.brand.wordmark}
        </p>
      </header>

      <div>
        {isEditorial && !composition ? (
          <section className={styles.editorialHero}>
            <div className={styles.editorialHeading}>
              {productLabel}
              {headline}
            </div>
            <div className={styles.editorialBody}>
              {image}
              <div className={styles.editorialSupport}>
                {lede}
                {offer}
                {action}
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.offerHero}>
            {isProductSecond ? (
              <div className={styles.copy}>
                <div className={styles.headlineBlock}>
                  {productLabel}
                  {headline}
                  {!composition ? lede : null}
                </div>
                {image}
                <div className={styles.supportBlock}>
                  {offer}
                  {action}
                  {composition ? lede : null}
                  {facts}
                </div>
              </div>
            ) : (
              <>
                <div className={styles.copy}>
                  {productLabel}
                  {headline}
                  {lede}
                  {offer}
                  {action}
                  {facts}
                </div>
                {image}
              </>
            )}
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

        {showClose ? (
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
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span>{theme.brand.wordmark}</span>
        {previewLabel ? <span className={styles.previewLabel}>{previewLabel}</span> : null}
        <span>© 2026 {theme.brand.name}</span>
      </footer>
    </article>
  );
}
