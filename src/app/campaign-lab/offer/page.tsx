import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OfferIntake } from "@/components/campaign-lab/offer-intake";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offer intake — Ornigami",
  description: "Local single-product offer intake for the Ornigami Campaign Lab.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfferIntakePage() {
  if (!isCampaignLabAvailable()) notFound();
  return <OfferIntake />;
}
