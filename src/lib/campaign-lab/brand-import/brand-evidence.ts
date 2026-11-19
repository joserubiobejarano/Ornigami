import { decodeEntities, activeHtml, attributes, referenceUrl } from "./html-lexical.ts";
import { createHash } from "node:crypto";
import { BRAND_EVIDENCE_LIMITS as L, type BrandKitDraft, type EvidenceCandidate,
  type EvidenceSource, type SuppliedBrandResource } from "./evidence-types.ts";
import { collectRasterEvidence } from "./raster-evidence.ts";

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const clip = (s: string, n: number = L.evidenceChars) => s.slice(0, n);
const HTML_TAG = /<([a-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const BASE_GAPS = [
  "All evidence is unreviewed; identity, campaign facts, destinations and media rights require independent approval.",
  "No computed styles: CSS variables, cascade, inheritance, selectors, themes and media queries are unresolved.",
  "Typography, geometry, contrast in context and font redistribution permissions are not extracted.",
  "Lexical HTML/CSS subset only; no rendering, script execution, network requests or live-site qualification.",
];

const plain = (s: string) => decodeEntities(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();


/** Deliberately small strict subset. Alpha is retained, never composited. */
export function observedCssColor(raw: string): { rgba: string; alpha: number } | null {
  let value = raw.trim().replace(/\s*!important\s*$/i, "").toLowerCase();
  const names: Record<string, string> = { black: "#000000", white: "#ffffff", transparent: "#00000000" };
  value = names[value] ?? value;
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map(c => c + c).join("");
    if (digits.length === 6) digits += "ff";
    return { rgba: `#${digits}`, alpha: parseInt(digits.slice(6), 16) / 255 };
  }
  const rgb = /^rgba?\(([^()]*)\)$/.exec(value);
  if (!rgb) return null;
  // Comma syntax and space/slash syntax must not be mixed.
  if (rgb[1].includes(",") ? !/^\s*[\d.%]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+(?:\s*,\s*[\d.%]+)?\s*$/.test(rgb[1]) :
    !/^\s*[\d.%]+\s+[\d.%]+\s+[\d.%]+(?:\s*\/\s*[\d.%]+)?\s*$/.test(rgb[1])) return null;
  const parts = rgb[1].trim().split(/\s*[,/]\s*|\s+/);
  if (parts.length < 3 || parts.length > 4 || parts.some(p => !/^\d*\.?\d+%?$/.test(p))) return null;
  const channels = parts.slice(0, 3).map(p => Number(p.replace("%", "")) * (p.endsWith("%") ? 255 / 100 : 1));
  const a = parts[3] ?? "1";
  const alpha = Number(a.replace("%", "")) / (a.endsWith("%") ? 100 : 1);
  if (channels.some(c => c < 0 || c > 255) || alpha < 0 || alpha > 1) return null;
  return { rgba: `#${[...channels, alpha * 255].map(c => Math.round(c).toString(16).padStart(2, "0")).join("")}`, alpha };
}

type Add = (category: EvidenceCandidate["category"], observed: string, method: EvidenceCandidate["method"],
  offset: number | null, quote: string, details?: EvidenceCandidate["details"], role?: string, uncertainty?: string[]) => void;

function collectCss(css: string, baseOffset: number, source: EvidenceSource, add: Add): void {
  // Mask comments and strings before declaration matching; offsets remain exact.
  const masked = css.replace(/\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    s => " ".repeat(s.length));
  if (/@(?:media|supports|layer|container)|prefers-color-scheme|\[data-theme/i.test(css))
    source.issues.push("conditional-or-multiple-theme-evidence-unresolved");
  for (const m of masked.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const property = m[1].toLowerCase();
    if (!(property.startsWith("--") || /^(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color)$/.test(property))) continue;
    const valueStart = m.index! + m[0].indexOf(":") + 1;
    const raw = css.slice(valueStart, m.index! + m[0].length).trim();
    const offset = baseOffset + valueStart + css.slice(valueStart, m.index! + m[0].length).indexOf(raw);
    const color = observedCssColor(raw);
    if (!color) { source.issues.push("unsupported-or-unresolved-color-value"); continue; }
    const role = property.startsWith("--") ? "unresolved-variable" : property === "color" ? "ink" : property.startsWith("background") ? "background-or-surface" : "decoration";
    add("ui-color", color.rgba, "css-declaration", offset, raw,
      { property, alpha: color.alpha, rank: property.startsWith("--brand") ? 2 : 1 }, role,
      ["Declaration presence does not establish visibility, ownership or brand role.",
        ...(color.alpha < 1 ? ["Translucent: appearance depends on unresolved background/composition."] : [])]);
  }
  // Discovery from unmasked strings, but never from comments. No request is made.
  const uncommented = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, s => " ".repeat(s.length));
  for (const m of uncommented.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+["']([^"']+)["']/gi)) {
    if (!/^(?:url\(|@import\b)/i.test(masked.slice(m.index!))) continue;
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
    const url = referenceUrl(raw, source.finalUrl);
    if (!url) { source.issues.push("unsupported-reference"); continue; }
    add("reference", url, "css-reference", baseOffset + m.index!, css.slice(m.index!, m.index! + m[0].length),
      { kind: "css-resource", fetched: false }, "resource-purpose-unknown",
      ["May be a font, image or stylesheet; discovery grants no fetch authorization or redistribution permission."]);
  }
}

function collectHtml(html: string, source: EvidenceSource, add: Add): void {
  const active = activeHtml(html);
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(active);
  if (title) {
    const value = plain(title[1]);
    if (value.length > L.textChars) source.issues.push("text-field-truncated");
    add("title", clip(value, L.textChars), "html-title", title.index, html.slice(title.index, title.index + title[0].length));
  }
  const tagsOnly = active.replace(/<(style|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    s => " ".repeat(s.length));
  for (const m of tagsOnly.matchAll(HTML_TAG)) {
    const a = attributes(m[0], m.index!);
    const val = (key: string) => decodeEntities(a.get(key)?.value ?? "");
    const tag = m[1].toLowerCase();
    const name = (val("name") || val("property")).toLowerCase();
    if (tag === "meta" && ["description", "og:description"].includes(name)) {
      const value = plain(val("content"));
      if (value.length > L.textChars) source.issues.push("text-field-truncated");
      add("description", clip(value, L.textChars), "html-description", m.index!, m[0]);
    }
    if (tag === "meta" && name === "theme-color") {
      const color = observedCssColor(val("content"));
      if (color) add("ui-color", color.rgba, "html-theme-color", m.index!, m[0],
        { alpha: color.alpha, media: clip(val("media")), rank: 3 }, "browser-theme",
        ["Browser chrome hint; not an approved campaign accent.", "Media condition and alpha composition unresolved."]);
      else source.issues.push("unsupported-theme-color");
    }
    const ref = tag === "meta" && ["og:image", "og:image:url"].includes(name) ? a.get("content") :
      tag === "link" ? a.get("href") : ["img", "source"].includes(tag) ? a.get("src") : undefined;
    const kind = tag === "link" ? val("rel").toLowerCase() : tag === "meta" ? "og-image" : "image";
    if (ref && (tag !== "link" || kind.split(/\s+/).some(token => ["stylesheet", "icon", "preload"].includes(token)))) {
      const url = referenceUrl(ref.value, source.finalUrl);
      if (url) add("reference", url, "html-reference", m.index!, m[0], { kind: clip(kind), fetched: false },
        /logo|wordmark/i.test(val("alt") + " " + val("class") + " " + val("id")) ? "possible-logo" : "resource",
        ["Reference only; asset purpose, owner identity and media rights unverified."]);
      else source.issues.push("unsupported-reference");
    }
    if (a.has("srcset")) source.issues.push("srcset-not-parsed");
    const style = a.get("style");
    if (style) {
      if (style.value.includes("&")) source.issues.push("entity-encoded-inline-css-not-parsed");
      else collectCss(style.value, style.offset, source, add);
    }
  }
  for (const m of active.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const offset = m.index! + m[0].indexOf(">") + 1;
    collectCss(m[1], offset, source, add);
  }
  // This is lexical source text, not visibility-qualified copy. Exclude head and styles.
  const body = html.replace(/<!--[\s\S]*?(?:-->|$)|<(script|template|svg|noscript|iframe)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
    s => "\u0000".repeat(s.length)).replace(/<head\b[^>]*>[\s\S]*?(?:<\/head\s*>|$)|<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)|<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, s => "\u0000".repeat(s.length));
  let remaining = L.textChars;
  const tagRanges = /<\/?[a-z][\w:-]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  const textOnly = body.replace(tagRanges, s => "\u0000".repeat(s.length));
  for (const m of textOnly.matchAll(/[^\u0000]+/g)) {
    const text = plain(m[0]);
    if (!text) continue;
    if (remaining <= 0) { source.issues.push("text-limit"); break; }
    const value = text.slice(0, Math.min(remaining, L.evidenceChars));
    const first = m[0].search(/\S/);
    const offset = m.index! + Math.max(0, first);
    add("text", value, "html-text", offset, html.slice(offset, offset + m[0].length - Math.max(0, first)));
    remaining -= value.length;
    if (text.length > value.length) source.issues.push("text-segment-truncated");
  }
}

/** Pure supplied-byte intake plus a bounded sequential Node raster adapter. Never fetches. */
export async function collectBrandKitDraft(resources: readonly SuppliedBrandResource[]): Promise<BrandKitDraft> {
  const draft: BrandKitDraft = { schemaVersion: "1.0.0", extractorVersion: "ornigami-brand-evidence/1.0.0",
    outcome: "incomplete", sources: [], candidates: [], acceptedValues: [],
    approvals: { brand: false, campaignFacts: false, mediaRights: false }, gaps: [...BASE_GAPS], limits: L };
  const preflight = resources.length > L.resources ? "resource-count-limit" :
    resources.reduce((sum, r) => sum + r.body.byteLength, 0) > L.totalBytes ? "total-byte-limit" :
    resources.some(r => r.body.byteLength > (r.kind === "html" ? L.htmlBytes : r.kind === "css" ? L.cssBytes : L.rasterBytes)) ? "resource-byte-limit" :
    resources.some(r => r.requestedUrl.length > L.urlChars || r.finalUrl.length > L.urlChars || (r.contentType?.length ?? 0) > L.evidenceChars) ? "resource-metadata-limit" : null;
  if (preflight) { draft.gaps.push(preflight + ": collection rejected before hashing, parsing or decoding"); return draft; }
  // Snapshot all bounded bytes before the first await so callers cannot change later evidence.
  const snapshots = resources.map(r => ({ ...r, body: Uint8Array.from(r.body) }));
  let images = 0;
  for (const r of snapshots) {
    const sha256 = hash(r.body);
    const source: EvidenceSource = { kind: r.kind, requestedUrl: clip(r.requestedUrl, L.urlChars),
      finalUrl: clip(r.finalUrl, L.urlChars), status: r.status, contentType: r.contentType === null ? null : clip(r.contentType),
      id: hash(JSON.stringify([r.kind, r.requestedUrl, r.finalUrl, r.status, r.contentType, sha256])),
      sha256, byteLength: r.body.byteLength, outcome: "processed", issues: [] };
    if (draft.sources.some(s => s.id === source.id)) continue;
    draft.sources.push(source);
    const add: Add = (category, observed, method, offset, quote, details = {}, role, uncertainty = []) => {
      if (draft.candidates.length >= L.candidates) { source.issues.push("candidate-limit"); return; }
      if (!observed) return;
      draft.candidates.push({ id: hash(JSON.stringify([source.id, method, offset, observed])), sourceId: source.id,
        sourceSha256: sha256, category, observed, method,
        evidence: { quote: clip(quote), utf16Offset: offset }, details,
        roleHint: role ? { value: role, reason: "Lexical property/metadata/attribute hint; not computed or accepted." } : null,
        confidence: { level: category === "ui-color" ? "medium" : "low", calibrated: false,
          reason: category === "ui-color" ? "Literal declaration/metadata; role and applicability unresolved." : "Source occurrence or bounded image sample; identity relevance unverified." },
        uncertainty: ["Untrusted source evidence; review required, including marketplace versus seller identity.",
          ...(quote.length > L.evidenceChars ? ["Evidence excerpt truncated; inspect source bytes for full context."] : []),
          ...uncertainty], reviewStatus: "unreviewed" });
    };
    if (!referenceUrl(r.finalUrl) || !referenceUrl(r.requestedUrl) || !Number.isInteger(r.status) || r.status < 200 || r.status >= 300) {
      source.outcome = "rejected"; source.issues.push("invalid-source-url-or-status"); continue;
    }
    const mime = r.contentType?.split(";")[0].trim().toLowerCase();
    if (r.kind === "raster") {
      if (++images > L.rasterCount) { source.outcome = "rejected"; source.issues.push("raster-count-limit"); continue; }
      if (!["image/png", "image/jpeg", "image/webp"].includes(mime ?? "")) {
        source.outcome = "unsupported"; source.issues.push("unsupported-raster-media-type"); continue;
      }
      const result = await collectRasterEvidence(r.body, mime);
      source.outcome = result.outcome; source.issues.push(...result.issues);
      for (const sample of result.samples) add("raster-color", sample.rgba, "raster-sample", null,
        "Nearest-neighbour sample, maximum 64×64, converted to sRGB; no background composition.",
        { ...sample, width: result.width!, height: result.height! }, "image-palette-only",
        ["May depict a photograph or product; never ranked as website UI or brand colors.", "Sample frequency is not brand confidence."]);
      continue;
    }
    if (!(r.kind === "html" ? mime === "text/html" : r.kind === "css" && mime === "text/css") ||
      /charset\s*=\s*["']?(?!utf-?8\b)[\w-]+/i.test(r.contentType ?? "")) {
      source.outcome = "unsupported"; source.issues.push("only-utf8-html-css-supported"); continue;
    }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(r.body); }
    catch { source.outcome = "rejected"; source.issues.push("invalid-utf8"); continue; }
    if (r.kind === "html") collectHtml(text, source, add); else collectCss(text, 0, source, add);
  }
  for (const s of draft.sources) s.issues = [...new Set(s.issues)];
  const ui = draft.candidates.filter(c => c.category === "ui-color");
  if (ui.length) draft.outcome = "draft";
  else if (draft.sources.length && draft.sources.every(s => s.outcome === "unsupported")) draft.outcome = "unsupported";
  if (!ui.length) draft.gaps.push("No supported website UI color evidence; no brand style invented.");
  if (!draft.candidates.some(c => c.category === "text")) draft.gaps.push("No source body text; empty/JS-only content cannot establish identity.");
  if (draft.sources.some(s => s.issues.length || s.outcome !== "processed")) draft.gaps.push("Partial/unsupported evidence: inspect each source's issues and outcome.");
  return draft;
}

/** For embedding inspectable JSON in an HTML report. Plain JSON files need no HTML wrapper. */
export function brandDraftHtmlText(draft: BrandKitDraft): string {
  return JSON.stringify(draft, null, 2).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
