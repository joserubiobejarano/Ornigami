import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import { EB_Garamond, Jost } from "next/font/google";
import { notFound } from "next/navigation";

import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import {
  buildMomisaDirectionPreviews,
  type MomisaDirectionInput,
} from "@/lib/campaign-lab/directions/momisa-direction";
import type { CampaignPreviewData } from "@/lib/campaign-lab/template";

import styles from "./direction.module.css";
import { DirectionPreview } from "./direction-preview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Momisa direction comparison — Campaign Lab",
  description:
    "Local-only visual direction comparison using the approved Momisa export brief and packshot.",
  robots: {
    index: false,
    follow: false,
  },
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

const INPUT_PATH = join(
  process.cwd(),
  ".local",
  "momisa-direction",
  "approved-brief.json",
);
const ASSET_PATH = join(
  process.cwd(),
  ".local",
  "momisa-direction",
  "inputs",
  "Box.jpg",
);

async function loadApprovedBrief(): Promise<MomisaDirectionInput | null> {
  try {
    const raw = await readFile(INPUT_PATH, "utf8");
    const parsed = JSON.parse(raw) as MomisaDirectionInput;
    if (parsed.schemaVersion !== 1) return null;
    if (
      !parsed.productName?.trim() ||
      !parsed.offer?.trim() ||
      !parsed.destinationUrl?.trim() ||
      !parsed.asset?.sha256?.trim() ||
      !Array.isArray(parsed.facts) ||
      parsed.facts.length === 0
    ) {
      return null;
    }

    const bytes = await readFile(ASSET_PATH);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== parsed.asset.sha256) return null;

    return parsed;
  } catch {
    return null;
  }
}

type PreviewFrameProps = {
  label: "A" | "B";
  viewport: "375" | "desktop";
  preview: CampaignPreviewData;
  headingId: string;
};

function PreviewFrame({
  label,
  viewport,
  preview,
  headingId,
}: PreviewFrameProps) {
  const isMobile = viewport === "375";
  return (
    <div
      className={styles.preview}
      data-direction-preview={label}
      data-viewport={viewport}
    >
      <div className={styles.previewLabel}>
        <strong>{label}</strong>
        <span>{isMobile ? "375 px" : "Desktop"}</span>
      </div>
      <div
        className={isMobile ? styles.shellMobile : styles.shellDesktop}
        data-direction-shell
      >
        <div className={isMobile ? styles.frameMobile : styles.frameDesktop}>
          <div className={styles.canvas}>
            <DirectionPreview preview={preview} headingId={headingId} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function MomisaDirectionPage() {
  if (!isCampaignLabAvailable()) notFound();

  const input = await loadApprovedBrief();
  if (!input) notFound();

  let previews: ReturnType<typeof buildMomisaDirectionPreviews>;
  try {
    previews = buildMomisaDirectionPreviews(input);
  } catch (error) {
    return (
      <main className={`${directionDisplay.variable} ${directionBody.variable} ${styles.page}`}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Campaign Lab · local only</p>
          <h1 className={styles.title}>Momisa direction comparison could not render</h1>
          <p className={styles.note}>
            {error instanceof Error
              ? error.message
              : "The approved local brief did not build."}
          </p>
        </header>
      </main>
    );
  }

  return (
    <main
      className={`${directionDisplay.variable} ${directionBody.variable} ${styles.page}`}
    >
      <header className={styles.header}>
        <p className={styles.eyebrow}>Campaign Lab · local only</p>
        <h1 className={styles.title}>Momisa Glow Box — visual direction comparison</h1>
        <p className={styles.note}>
          Both pages use the same approved product name, offer, Amazon
          destination, facts, and packshot. Labels are neutral. Review at 375 px
          and desktop, then record a preference before opening the change log.
        </p>
        <p className={styles.meta}>
          Source: approved local export revision {input.source.approvedExportRevision}.
          Packshot SHA-256 {input.asset.sha256.slice(0, 16)}…{" "}
          Inputs and captures stay under .local/momisa-direction/.
        </p>
      </header>

      <div className={styles.rows}>
        <section className={styles.row} aria-label="Direction A">
          <PreviewFrame
            label="A"
            viewport="375"
            preview={previews.reference}
            headingId="direction-a-mobile-heading"
          />
          <PreviewFrame
            label="A"
            viewport="desktop"
            preview={previews.reference}
            headingId="direction-a-desktop-heading"
          />
        </section>

        <section className={styles.row} aria-label="Direction B">
          <PreviewFrame
            label="B"
            viewport="375"
            preview={previews.alternative}
            headingId="direction-b-mobile-heading"
          />
          <PreviewFrame
            label="B"
            viewport="desktop"
            preview={previews.alternative}
            headingId="direction-b-desktop-heading"
          />
        </section>
      </div>
    </main>
  );
}
