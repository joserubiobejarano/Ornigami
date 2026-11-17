import type { Metadata } from "next";
import { EB_Garamond, Jost } from "next/font/google";
import { notFound } from "next/navigation";

import { DirectionPreview } from "@/app/campaign-lab/direction/direction-preview";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { loadMomisaDirectionInput } from "@/lib/campaign-lab/directions/local-momisa-input";
import { buildMomisaDirectionPreviews } from "@/lib/campaign-lab/directions/momisa-direction";

import styles from "./preview.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Momisa direction preview — Campaign Lab",
  robots: { index: false, follow: false },
};

const directionDisplay = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-direction-display",
  weight: ["400", "500"],
  display: "swap",
});

const directionBody = Jost({
  subsets: ["latin"],
  variable: "--font-direction-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type PreviewPageProps = {
  searchParams: Promise<{
    direction?: string;
    original?: string;
  }>;
};

export default async function DirectionPreviewPage({
  searchParams,
}: PreviewPageProps) {
  if (!isCampaignLabAvailable()) notFound();

  const input = await loadMomisaDirectionInput();
  if (!input) notFound();

  const previews = buildMomisaDirectionPreviews(input);
  const { direction, original } = await searchParams;
  const selected =
    direction === "A"
      ? previews.reference
      : direction === "B"
        ? original === "1"
          ? previews.alternativeOriginal
          : previews.alternative
        : null;

  if (!selected) notFound();

  return (
    <main
      className={`${directionDisplay.variable} ${directionBody.variable} ${styles.page}`}
    >
      <div className={styles.shell} data-preview-shell>
        <div className={styles.frame}>
          <div className={styles.canvas}>
            <DirectionPreview
              preview={selected}
              headingId={`direction-preview-${direction}-heading`}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
