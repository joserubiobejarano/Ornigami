import sharp from "sharp";
import { BRAND_EVIDENCE_LIMITS as L } from "./evidence-types.ts";

export type RasterSample = { rgba: string; pixels: number; fraction: number };
export type RasterEvidence = {
  outcome: "processed" | "unsupported" | "rejected";
  issues: string[];
  width?: number;
  height?: number;
  samples: RasterSample[];
};

/** Node-only adapter. No URL handling, SVG, animation, ICC claims or alpha flattening. */
export async function collectRasterEvidence(bytes: Uint8Array, mediaType?: string): Promise<RasterEvidence> {
  const fail = (outcome: RasterEvidence["outcome"], issue: string): RasterEvidence =>
    ({ outcome, issues: [issue], samples: [] });
  if (!bytes.byteLength || bytes.byteLength > L.rasterBytes) return fail("rejected", "raster-byte-limit");
  // Check signatures before handing data to native decoders (especially SVG/PDF).
  const b = Buffer.from(bytes);
  const png = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp = b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) return fail("unsupported", "only-png-jpeg-webp-signatures-supported");
  const detectedType = png ? "image/png" : jpeg ? "image/jpeg" : "image/webp";
  if (mediaType && mediaType !== detectedType) return fail("rejected", "raster-media-type-signature-mismatch");
  try {
    const image = sharp(b, { limitInputPixels: L.rasterPixels, failOn: "warning", sequentialRead: true });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > L.rasterPixels)
      return fail("rejected", "raster-pixel-limit");
    if ((meta.pages ?? 1) > 1) return fail("unsupported", "animated-or-multipage-raster");
    const { data, info } = await image.resize({ width: L.sampleSide, height: L.sampleSide,
      fit: "inside", withoutEnlargement: true, kernel: "nearest" })
      .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      // Preserve exact sampled alpha, retain neutrals, skip fully invisible pixels.
      if (data[i + 3] === 0) continue;
      const rgba = `#${[...data.subarray(i, i + 4)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
      counts.set(rgba, (counts.get(rgba) ?? 0) + 1);
    }
    return { outcome: "processed", width: meta.width, height: meta.height,
      issues: ["sampled-srgb-not-original-pixel-palette", "image-purpose-and-rights-unknown"],
      samples: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8)
        .map(([rgba, pixels]) => ({ rgba, pixels, fraction: pixels / (info.width * info.height) })) };
  } catch {
    return fail("rejected", "corrupt-raster-or-decoder-limit");
  }
}
