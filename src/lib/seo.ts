import type { Metadata } from "next";

export const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://ornigami.com").replace(/\/$/, "");

export function createPageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const canonical = `${siteUrl}${path === "/" ? "" : path}`;
  const image = `${siteUrl}/opengraph-image`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${title} | Ornigami` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
