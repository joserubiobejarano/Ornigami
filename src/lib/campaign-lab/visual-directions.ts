import type { BrandTokens, CampaignCatalog } from "./types.ts";
export const VISUAL_DIRECTION_VERSION = "1.0.0";
const CLEAR_TOKENS: BrandTokens = {
  page: "#f6f3ec",
  surface: "#e8e2d6",
  ink: "#1f2a24",
  muted: "#60695f",
  accent: "#2f5d4a",
  accentInk: "#f8faf7",
  line: "#d5cdbf",
  displayFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  bodyFont: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  displayWeight: 700,
  displayTracking: "-0.035em",
  labelCase: "uppercase",
  labelTracking: "0.14em",
  imageRadius: "12px",
  buttonRadius: "999px",
  heroImage: "framed",
  heroOrder: "product-first",
  prefersEditorial: false,
  detailBackground: "#1f2a24",
  detailInk: "#f6f3ec",
  imageBlend: "normal",
  showWordmarkMark: false,
};


export const VISUAL_DIRECTIONS = [
  { id: "clear", name: "Clear", description: "Sans type, framed product, direct hierarchy", tokens: CLEAR_TOKENS },
  { id: "editorial", name: "Editorial", description: "Serif type, warm palette, editorial hierarchy", tokens: { ...CLEAR_TOKENS,
    page: "#f2ebde", surface: "#e6dbc8", ink: "#1d2a3c", muted: "#5c6066", accent: "#234a6b", accentInk: "#f9f3e8", line: "#cbbda8",
    displayFont: "Georgia, serif", bodyFont: "Arial, sans-serif", displayWeight: 400, displayTracking: "-0.03em", labelTracking: "0.2em",
    heroImage: "arch", heroOrder: "headline-first", prefersEditorial: true, detailBackground: "#1d2a3c", detailInk: "#f2ebde",
  } as BrandTokens },
] as const;
export type VisualDirectionId = typeof VISUAL_DIRECTIONS[number]["id"];
export function resolveVisualDirection(value: unknown = "clear") {
  const direction = VISUAL_DIRECTIONS.find(direction => direction.id === value);
  if (!direction) throw new Error('Visual direction must be "clear" or "editorial". Choose a supported direction.');
  return { ...direction, version: VISUAL_DIRECTION_VERSION };
}
/** Shared local fallback uses the same app-owned registry as the server. */
export function browserDirectionCatalog(catalog: CampaignCatalog, directionId: unknown): CampaignCatalog {
  const direction = resolveVisualDirection(directionId);
  const brand = catalog.brands["browser-offer-brand"];
  if (!brand) throw new Error("Browser brand is unavailable.");
  return { ...catalog, brands: { ...catalog.brands, [brand.id]: { ...brand, tokens: { ...direction.tokens }, visualDirection: { id: direction.id, version: direction.version } } } };
}
