"use client";

import Image from "next/image";
import type { ImageProps } from "next/image";
import { useEffect, useRef } from "react";

import type { PreviewImageEvent } from "@/lib/campaign-lab/editor";

type PreviewImageProps = Omit<ImageProps, "src" | "onLoad" | "onError"> & {
  src: string;
  assetId: string;
  revision: string;
  attempt: number;
  onStateChange?: (event: PreviewImageEvent) => void;
};

function retrySource(src: string, attempt: number): string {
  if (attempt <= 0) return src;
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}campaignLabRetry=${attempt}`;
}

/**
 * Reports the actual load result of the rendered preview image. The parent
 * ties every event to the preview revision and retry attempt that produced it.
 */
export function PreviewImage({
  src,
  alt,
  assetId,
  revision,
  attempt,
  onStateChange,
  ...props
}: PreviewImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete) return;
    onStateChange?.({
      revision,
      assetId,
      attempt,
      status: image.naturalWidth > 0 ? "loaded" : "error",
    });
  }, [assetId, attempt, onStateChange, revision, src]);

  return (
    <Image
      {...props}
      alt={alt}
      ref={imageRef}
      src={retrySource(src, attempt)}
      onLoad={() =>
        onStateChange?.({ revision, assetId, attempt, status: "loaded" })
      }
      onError={() =>
        onStateChange?.({ revision, assetId, attempt, status: "error" })
      }
    />
  );
}
