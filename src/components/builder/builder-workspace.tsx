"use client";

import { OfferIntake } from "@/components/campaign-lab/offer-intake";

/**
 * Production wrapper around the proven local offer authoring/export surface.
 * The shell is separate from the Campaign Lab; the route gate is the only
 * reason this component is currently unreachable.
 */
export function BuilderWorkspace() {
  return (
    <OfferIntake
      surface="builder"
      generationEndpoint="/api/builder/generate"
    />
  );
}
