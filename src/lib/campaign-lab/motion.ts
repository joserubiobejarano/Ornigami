import { campaignMotionRuntimeSource } from "./motion-runtime.ts";

export const MOTION_RECIPES = [
  { id: "none", label: "Static reference" },
  { id: "quiet-product", label: "Restrained product motion" },
  { id: "product-inspect", label: "Product inspection" },
] as const;
export type MotionRecipeId = (typeof MOTION_RECIPES)[number]["id"];
export type MotionPresentation = {
  recipe: MotionRecipeId;
  recipeVersion: "1.1.0";
  runtimeIdentity: string | null;
  runtimeVersion: "1.1.0" | null;
  settings: { emphasisMs: number; emphasisScale: number; easing: string; actionFeedbackMs: 150; inspectionFeedbackMs: number; inspection: "none" | "native-pixels" };
};

export const MOTION_CSS = `
.ornigami-inspect-trigger,.ornigami-inspect-controls button{font:inherit;font-size:14px;line-height:1.3;min-width:44px;min-height:44px;padding:10px 14px;border:1px solid var(--cp-muted,#625f56);border-radius:var(--cp-button-radius,6px);background:var(--cp-page,#f6f3ec);color:var(--cp-ink,#202020);cursor:pointer;-webkit-tap-highlight-color:transparent}
.ornigami-inspect-trigger{position:absolute;bottom:12px;right:12px}
.ornigami-inspect-trigger:focus-visible,.ornigami-inspector :focus-visible{outline:3px solid var(--cp-accent,#333);outline-offset:3px}
.ornigami-inspect-trigger:active,.ornigami-inspect-controls button:active{opacity:.75}
@media(hover:hover) and (pointer:fine){.ornigami-inspect-trigger:hover,.ornigami-inspect-controls button:hover{background:var(--cp-surface,#eee)}}
@media(prefers-reduced-motion:no-preference){.ornigami-inspect-trigger,.ornigami-inspect-controls button{transition:opacity 120ms ease-out}}
.ornigami-inspector{box-sizing:border-box;width:min(96vw,1100px);max-width:96vw;max-height:94dvh;padding:12px;margin:auto;border:1px solid var(--cp-muted,#625f56);border-radius:min(var(--cp-button-radius,12px),16px);background:var(--cp-page,#f6f3ec);color:var(--cp-ink,#202020);overflow:hidden}
.ornigami-inspector::backdrop{background:color-mix(in srgb,var(--cp-ink,#000) 65%,transparent)}
.ornigami-inspector[open]{display:flex;flex-direction:column;height:94dvh}
.ornigami-inspect-controls{display:flex;flex-wrap:wrap;gap:8px;padding-bottom:12px}
.ornigami-inspect-directions:not([hidden]){display:flex;gap:4px}
.ornigami-inspect-pane{overflow:auto;min-height:0;flex:1;overscroll-behavior:contain}
.ornigami-inspect-pane img{display:block;width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;margin:auto}
.ornigami-inspect-enlarged img{max-width:none;max-height:none;margin:0}
`;

/** A deterministic change detector, not a cryptographic provenance claim.
 * The actual packaged bytes also receive SHA-256 in the normal export receipt. */
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function isMotionRecipeId(value: string): value is MotionRecipeId {
  return MOTION_RECIPES.some((entry) => entry.id === value);
}
export function motionPresentation(recipe: MotionRecipeId = "none"): MotionPresentation {
  if (!isMotionRecipeId(recipe)) throw new Error("Unknown motion recipe.");
  return {
    recipe, recipeVersion: "1.1.0",
    runtimeVersion: recipe === "none" ? null : "1.1.0",
    settings: { emphasisMs: recipe === "quiet-product" ? 250 : 0, emphasisScale: recipe === "quiet-product" ? 1.025 : 1, easing: "cubic-bezier(0.23, 1, 0.32, 1)", actionFeedbackMs: 150, inspectionFeedbackMs: recipe === "product-inspect" ? 120 : 0, inspection: recipe === "product-inspect" ? "native-pixels" : "none" },
    runtimeIdentity: recipe === "none" ? null : `ornigami-motion@1.1.0:${fingerprint(campaignMotionRuntimeSource() + MOTION_CSS)}`,
  };
}
export function assertCurrentMotion(value: MotionPresentation): void {
  if (JSON.stringify(value) !== JSON.stringify(motionPresentation(value.recipe))) {
    throw new Error("Motion configuration changed. Generate and approve a fresh preview before exporting.");
  }
}
