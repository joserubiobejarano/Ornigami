import { z } from "zod";
import { BRAND_EVIDENCE_LIMITS as L, type BrandKitDraft } from "./brand-import/evidence-types.ts";
import type { BrandTokens } from "./types.ts";

export const BRAND_FILE_BYTES = 512 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = (max = 240) => z.string().max(max);
const strings = z.array(text()).max(64);
const color = z.string().regex(/^#[a-f0-9]{6}$/i, "Use an opaque six-digit hex color.");
const rgba = z.string().regex(/^#[a-f0-9]{8}$/i);
const evidenceUrl = text(L.urlChars).refine(value => { try { const u=new URL(value); return ["http:","https:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }, "Evidence source must be a bounded HTTP(S) URL.");
const source = z.strictObject({ id: hash, kind: z.enum(["html", "css", "raster"]), requestedUrl: evidenceUrl, finalUrl: evidenceUrl, status: z.number().int().min(100).max(599), contentType: text(L.evidenceChars).nullable(), byteLength: z.number().int().min(0).max(L.totalBytes), sha256: hash, outcome: z.enum(["processed", "unsupported", "rejected"]), issues: strings });
const methods = z.enum(["html-title", "html-description", "html-text", "html-reference", "css-reference", "css-declaration", "html-theme-color", "raster-sample"]);
const candidate = z.strictObject({ id: hash, sourceId: hash, sourceSha256: hash, method: methods, category: z.enum(["title", "description", "text", "reference", "ui-color", "raster-color"]), observed: text(L.textChars), evidence: z.strictObject({ quote: text(), utf16Offset: z.number().int().min(0).max(L.totalBytes).nullable() }), details: z.strictObject({ property: text().optional(), alpha: z.number().min(0).max(1).optional(), rank: z.number().min(0).max(10).optional(), kind: text().optional(), fetched: z.literal(false).optional(), rgba: rgba.optional(), pixels: z.number().int().min(0).max(4096).optional(), fraction: z.number().min(0).max(1).optional(), width: z.number().int().min(1).max(L.rasterPixels).optional(), height: z.number().int().min(1).max(L.rasterPixels).optional() }), roleHint: z.strictObject({ value: text(), reason: text(1000) }).nullable(), confidence: z.strictObject({ level: z.enum(["low", "medium"]), reason: text(1000), calibrated: z.literal(false) }), uncertainty: strings, reviewStatus: z.literal("unreviewed") });
const draftSchema = z.strictObject({ schemaVersion: z.literal("1.0.0"), extractorVersion: z.literal("ornigami-brand-evidence/1.0.0"), outcome: z.enum(["draft", "incomplete", "unsupported"]), sources: z.array(source).max(L.resources), candidates: z.array(candidate).max(L.candidates), acceptedValues: z.array(z.never()).length(0), approvals: z.strictObject({ brand: z.literal(false), campaignFacts: z.literal(false), mediaRights: z.literal(false) }), gaps: strings, limits: z.strictObject(Object.fromEntries(Object.entries(L).map(([k,v]) => [k,z.literal(v)])) as { [K in keyof typeof L]: z.ZodLiteral<(typeof L)[K]> }) });

export function parseBrandEvidence(raw: string): BrandKitDraft {
  if (new TextEncoder().encode(raw).length > BRAND_FILE_BYTES) throw new Error("Brand evidence exceeds 512 KiB.");
  const d = draftSchema.parse(JSON.parse(raw));
  const sources = new Map(d.sources.map(s => [s.id,s]));
  if (sources.size !== d.sources.length || new Set(d.candidates.map(c => c.id)).size !== d.candidates.length) throw new Error("Duplicate evidence IDs.");
  if (d.sources.reduce((n,s) => n+s.byteLength,0) > L.totalBytes) throw new Error("Source byte budget exceeded.");
  for (const c of d.candidates) {
    const s = sources.get(c.sourceId);
    if (!s || c.sourceSha256 !== s.sha256) throw new Error("Candidate source/hash mismatch.");
    if (c.evidence.utf16Offset !== null && c.evidence.utf16Offset + c.evidence.quote.length > s.byteLength) throw new Error("Evidence offset is outside the declared source.");
    if (c.category === "ui-color" || c.category === "raster-color") {
      const parsed = rgba.parse(c.observed);
      if (c.category === "raster-color" ? c.method !== "raster-sample" || s.kind !== "raster" : !["css-declaration", "html-theme-color"].includes(c.method) || s.kind === "raster") throw new Error("Color method/source mismatch.");
      if (c.details.alpha !== undefined && Math.abs(c.details.alpha - parseInt(parsed.slice(7),16)/255) > 1/255) throw new Error("Color alpha mismatch.");
    }
  }
  // Parsed data is a fresh copy. Review choices never modify the collector draft.
  return d as BrandKitDraft;
}

export const PALETTE_ROLES = ["accent", "page", "surface"] as const;
export type PaletteRole = typeof PALETTE_ROLES[number];
const selection = z.strictObject({ role: z.enum(PALETTE_ROLES), value: color, candidateId: hash, originalValue: rgba, sourceId: hash, sourceSha256: hash, method: z.enum(["css-declaration", "html-theme-color", "raster-sample"]), category: z.enum(["ui-color", "raster-color"]), review: z.enum(["selected", "corrected"]) });
const snapshotSchema = z.strictObject({ schemaVersion: z.literal("ornigami-brand-snapshot/1.0.0"), draftSchemaVersion: z.literal("1.0.0"), extractorVersion: z.literal("ornigami-brand-evidence/1.0.0"), provenance: z.literal("imported-claims-unverified"), reviewMethod: z.literal("local-operator-palette"), selections: z.array(selection).min(1).max(3), ownerConfirmed: z.literal(false), campaignFactsApproved: z.literal(false), mediaRightsApproved: z.literal(false), sourceBytesVerified: z.literal(false) });
export type BrandKitSnapshot = z.infer<typeof snapshotSchema>;
export function parseBrandSnapshot(raw: unknown): BrandKitSnapshot {
  const s = snapshotSchema.parse(raw);
  if (new Set(s.selections.map(v => v.role)).size !== s.selections.length) throw new Error("Choose each palette role once.");
  for (const v of s.selections) {
    if (v.review === "selected" && (v.originalValue.slice(7).toLowerCase() !== "ff" || v.value.toLowerCase() !== v.originalValue.slice(0,7).toLowerCase())) throw new Error("Translucency requires an explicit opaque correction.");
    if ((v.method === "raster-sample") !== (v.category === "raster-color")) throw new Error("Palette category/method mismatch.");
  }
  for (const v of s.selections) Object.freeze(v);
  Object.freeze(s.selections); Object.freeze(s);
  return s;
}
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => { const c = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
  const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

/** The visible offer background: accent tint or the editorial page surface. */
export function offerBackground(tokens: Pick<BrandTokens, "accent" | "page" | "offerStyle">): string {
  if (tokens.offerStyle === "editorial") return tokens.page;
  return "#"+[1,3,5].map(i=>Math.round(parseInt(tokens.accent.slice(i,i+2),16)*.09+parseInt(tokens.page.slice(i,i+2),16)*.91).toString(16).padStart(2,"0")).join("");
}

/**
 * Resolves the emphasis foreground without changing the reviewed accent.
 * Prefer the accent when it is readable, then the approved body ink, then an
 * app-owned high-contrast ink. This keeps pale accents usable without
 * discarding an imported palette or rewriting commercial text.
 */
export function pickOfferEmphasisInk(
  tokens: Pick<BrandTokens, "accent" | "page" | "ink" | "accentInk" | "offerStyle">,
): string {
  const background = offerBackground(tokens);
  const candidates = [tokens.accent, tokens.ink, tokens.accentInk, "#171813", "#fffaf1"];
  for (const candidate of candidates) {
    if (contrast(candidate, background) >= 4.5) return candidate.toLowerCase();
  }
  return contrast("#171813", background) >= contrast("#fffaf1", background) ? "#171813" : "#fffaf1";
}

export function paletteTokens(defaults: BrandTokens, raw?: BrandKitSnapshot, override?: string): BrandTokens {
  const tokens = { ...defaults };
  if (raw) for (const v of parseBrandSnapshot(raw).selections) tokens[v.role] = v.value.toLowerCase();
  if (override) tokens.accent = color.parse(override).toLowerCase();
  // The renderer owns the dependent action text role. Do not alter the observation.
  tokens.accentInk = contrast(tokens.accent,"#171813") >= contrast(tokens.accent,"#fffaf1") ? "#171813" : "#fffaf1";
  tokens.offerEmphasisInk = pickOfferEmphasisInk(tokens);
  if (raw) {
    const pairs: [string,string,number][] = [["ink","page",4.5],["muted","page",4.5],["accent","page",4.5],["accentInk","accent",4.5],["detailInk","detailBackground",4.5]];
    const tint=offerBackground(tokens);
    if (contrast(tokens.ink,tint)<4.5 || contrast(tokens.accent,tint)<4.5) throw new Error("Offer text on its background needs 4.5:1 contrast. Correct the palette.");
    const detailLabel="#"+[1,3,5].map(i=>Math.round(parseInt(tokens.detailInk.slice(i,i+2),16)*.62+parseInt(tokens.detailBackground.slice(i,i+2),16)*(1-.62)).toString(16).padStart(2,"0")).join("");
    if (contrast(detailLabel,tokens.detailBackground)<4.5) throw new Error("Dependent detail labels need 4.5:1 contrast.");
    for (const [fg,bg,min] of pairs) if (contrast(tokens[fg as keyof BrandTokens] as string,tokens[bg as keyof BrandTokens] as string) < min) throw new Error(`${fg} on ${bg} needs ${min}:1 contrast. Correct the palette or remove the active accent override.`);
  }
  return tokens;
}

/** Current palette validation is independent of file-read state and never mutates evidence. */
export function reviewPalette(
  draft: BrandKitDraft,
  choices: Partial<Record<PaletteRole, { candidateId: string; value: string }>>,
  defaults: BrandTokens,
  override?: string,
): { snapshot?: BrandKitSnapshot; error?: string } {
  if (!Object.values(choices).some(choice => choice?.candidateId)) return {};
  try {
    const selections = PALETTE_ROLES.flatMap(role => {
      const choice = choices[role];
      if (!choice?.candidateId) return [];
      const candidate = draft.candidates.find(candidate => candidate.id === choice.candidateId);
      if (!candidate) throw new Error("Selected evidence is unavailable. Choose a current candidate.");
      return [{
        role, value: choice.value, candidateId: candidate.id,
        originalValue: candidate.observed, sourceId: candidate.sourceId,
        sourceSha256: candidate.sourceSha256, method: candidate.method, category: candidate.category,
        review: candidate.observed.toLowerCase() === `${choice.value.toLowerCase()}ff` ? "selected" : "corrected",
      }];
    });
    const snapshot = parseBrandSnapshot({
      schemaVersion: "ornigami-brand-snapshot/1.0.0", draftSchemaVersion: draft.schemaVersion,
      extractorVersion: draft.extractorVersion, provenance: "imported-claims-unverified",
      reviewMethod: "local-operator-palette", selections, ownerConfirmed: false,
      campaignFactsApproved: false, mediaRightsApproved: false, sourceBytesVerified: false,
    });
    paletteTokens(defaults, snapshot, override);
    return { snapshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid palette.";
    return { error: message.startsWith("[")
      ? "Use opaque six-digit hex corrections. Translucency cannot be applied."
      : message };
  }
}

/** One selection stream: old reads cannot publish either success or error. */
export class BrandEvidenceFileReader {
  private sequence = 0;
  cancel() { this.sequence++; }
  async read(file?: { size: number; text(): Promise<string> }): Promise<{ stale: true } | { stale: false; draft?: BrandKitDraft; error?: string }> {
    const ticket=++this.sequence;
    if (!file) return {stale:false};
    try {
      if (file.size>BRAND_FILE_BYTES) throw new Error("Brand evidence exceeds 512 KiB. Choose a smaller saved draft.");
      const draft=parseBrandEvidence(await file.text());
      return ticket===this.sequence ? {stale:false,draft} : {stale:true};
    } catch(e) {
      if(ticket!==this.sequence) return {stale:true};
      const message=e instanceof Error ? e.message : "Invalid evidence.";
      return {stale:false,error:message.startsWith("[") ? "Invalid BrandKitDraft. Check version, bounds, references and false approval flags." : message};
    }
  }
}
