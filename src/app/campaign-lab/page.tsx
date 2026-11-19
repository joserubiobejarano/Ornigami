import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CampaignLab } from "@/components/campaign-lab/campaign-lab";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { normalizeFixtureId } from "@/lib/campaign-lab/fixtures";
import { loadCampaignCatalog } from "@/lib/campaign-lab/pilots/local-pilot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign Lab — Ornigami",
  description: "Local, fictional campaign-page workflow for the Ornigami landing-page builder.",
  robots: {
    index: false,
    follow: false,
  },
};

type CampaignLabPageProps = {
  searchParams: Promise<{
    fixture?: string | string[];
  }>;
};

export default async function CampaignLabPage({ searchParams }: CampaignLabPageProps) {
  if (!isCampaignLabAvailable()) {
    notFound();
  }

  const { fixture } = await searchParams;
  const catalog = loadCampaignCatalog();
  const fixtureId = normalizeFixtureId(fixture, catalog);

  return (
    <div
      style={{ display: "contents" }}
    >
      <CampaignLab key={fixtureId} initialFixtureId={fixtureId} catalog={catalog} />
    </div>
  );
}
