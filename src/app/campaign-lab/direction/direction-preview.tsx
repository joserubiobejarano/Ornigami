"use client";

import { useCallback, useState } from "react";

import { CampaignPage } from "@/components/campaign-lab/campaign-page";
import type { PreviewImageEvent, PreviewImageStatus } from "@/lib/campaign-lab/editor";
import type { CampaignPreviewData } from "@/lib/campaign-lab/template";

type DirectionPreviewProps = {
  preview: CampaignPreviewData;
  headingId: string;
};

/**
 * Renders one approved brief through the real CampaignPage renderer. This
 * wrapper only supplies image-loading state; it adds no layout or copy.
 */
export function DirectionPreview({ preview, headingId }: DirectionPreviewProps) {
  const [imageStatus, setImageStatus] = useState<PreviewImageStatus>("pending");
  const imageAttempt = 0;

  const onImageStateChange = useCallback((event: PreviewImageEvent) => {
    setImageStatus(event.status);
  }, []);

  return (
    <CampaignPage
      brief={preview.brief}
      draft={preview.draft}
      asset={preview.asset}
      theme={preview.theme}
      headingId={headingId}
      imageRevision={preview.revision}
      imageStatus={imageStatus}
      imageAttempt={imageAttempt}
      onImageStateChange={onImageStateChange}
    />
  );
}
