import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DirectionPreview } from "@/app/campaign-lab/direction/direction-preview";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import {
  APPROVED_ASSETS,
  BRANDS,
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "@/lib/campaign-lab/fixtures";
import { buildCampaignPreview } from "@/lib/campaign-lab/template";
import type { CampaignCatalog } from "@/lib/campaign-lab/types";

import styles from "../preview/preview.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Headline-first offer geometry regression — Campaign Lab",
  robots: { index: false, follow: false },
};

/**
 * Local regression probe for the base offer geometry. There is no shipped
 * headline-first offer fixture, so this uses the existing Harbor Field sparse
 * fixture and the existing headline-first token. It exists only to prove that
 * the experiment's product-second grid does not change the base geometry.
 */
export default function HeadlineFirstOfferRegressionPage() {
  if (!isCampaignLabAvailable()) notFound();

  const fixture = CAMPAIGN_FIXTURES.sparse;
  const baseBrand = BRANDS["harbor-field"];
  const brand = {
    ...baseBrand,
    tokens: {
      ...baseBrand.tokens,
      heroOrder: "headline-first" as const,
    },
  };
  const catalog: CampaignCatalog = {
    brands: { [brand.id]: brand },
    fixtures: { [fixture.id]: fixture },
    assets: APPROVED_ASSETS,
  };
  const values = createFormValues(fixture, catalog);
  const result = buildCampaignPreview(fixture, values, catalog);

  if (!result.ok) {
    return (
      <main className={styles.page}>
        <p>Regression preview could not render: {result.issues[0]?.message}</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell} data-regression-shell>
        <div className={styles.frame}>
          <div className={styles.canvas}>
            <DirectionPreview
              preview={result.preview}
              headingId="headline-first-offer-regression-heading"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
