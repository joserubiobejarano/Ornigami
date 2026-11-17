import type { BrowserOfferVerification } from "./browser-offer.ts";
import type { CampaignVerificationProvenance } from "./verification-provenance.ts";
import {
  buildFontNotice,
  findFontLicense,
} from "./font-licenses.ts";
import type { BundledFontLicense } from "./font-licenses.ts";

/**
 * Local, development-only export for an approved direct-offer revision.
 *
 * The export starts from a synchronous snapshot of the approved article,
 * packshot, style inputs and approval. Asynchronous packaging only reads that
 * snapshot, and the download is cancelled if the editor approval changes before
 * the archive is complete.
 */

export type LocalPreviewApprovalInput = {
  revision: string | null;
  approvalRevision: string | null | undefined;
  dirty: boolean;
  generating: boolean;
  imagesReady: boolean;
};

export function isLocalPreviewApproved(
  input: LocalPreviewApprovalInput,
): boolean {
  return (
    Boolean(input.revision) &&
    input.approvalRevision === input.revision &&
    !input.dirty &&
    !input.generating &&
    input.imagesReady
  );
}

export function sameExportGuard(
  left: LocalPreviewApprovalInput,
  right: LocalPreviewApprovalInput,
): boolean {
  return (
    left.revision === right.revision &&
    left.approvalRevision === right.approvalRevision &&
    left.dirty === right.dirty &&
    left.generating === right.generating &&
    left.imagesReady === right.imagesReady &&
    isLocalPreviewApproved(right)
  );
}

export type CampaignExportEligibilityInput = LocalPreviewApprovalInput & {
  supportedFormat: boolean;
};

export type CampaignExportEligibility = {
  ok: boolean;
  reason: string;
};

/**
 * Mirrors the editor approval gate and adds only the direct-offer template
 * check. Each failure explains the real next action instead of implying that a
 * stale or edited preview can be exported.
 */
export function evaluateCampaignExport(
  input: CampaignExportEligibilityInput,
): CampaignExportEligibility {
  if (!input.revision) {
    return {
      ok: false,
      reason: "Generate a valid direct-offer preview before exporting.",
    };
  }
  if (input.generating) {
    return {
      ok: false,
      reason: "Wait for generation to finish, then approve the rendered revision.",
    };
  }
  if (input.dirty) {
    return {
      ok: false,
      reason:
        "The brief has edits that are not rendered. Generate a fresh preview and approve that revision before exporting.",
    };
  }
  if (!input.imagesReady) {
    return {
      ok: false,
      reason: "Wait for the required packshot to load before exporting.",
    };
  }
  if (!input.approvalRevision || input.approvalRevision !== input.revision) {
    return {
      ok: false,
      reason: "This rendered revision is not locally approved yet.",
    };
  }
  if (!input.supportedFormat) {
    return {
      ok: false,
      reason: "Standalone export is available for the direct-offer template only.",
    };
  }
  return {
    ok: true,
    reason: `Revision ${shortExportRevision(input.revision)} is locally approved and ready to export.`,
  };
}

export class CampaignExportCancelledError extends Error {
  constructor() {
    super(
      "Export cancelled because the approved revision changed while the archive was being packaged. Generate and approve the current revision, then export again. No download was created.",
    );
    this.name = "CampaignExportCancelledError";
  }
}

export class CampaignExportFontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignExportFontError";
  }
}

export class CampaignExportReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignExportReferenceError";
  }
}

export class CampaignExportIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignExportIntegrityError";
  }
}

export type CampaignExportAsset = {
  id: string;
  contentHash: string;
  alt: string;
  width: number;
  height: number;
  src: string;
};

export type CampaignExportPreview = {
  status: "preview" | "confirmed";
  notice?: string;
  revision: string;
  productName: string;
  brandName: string;
  offer: string;
  offerPrice?: string;
  destinationUrl: string;
  actionLabel: string;
  template: {
    id: string;
    version: string;
    layout: string;
    sections: readonly string[];
  };
  asset: CampaignExportAsset;
  verification?: BrowserOfferVerification | null;
  provenance?: CampaignVerificationProvenance;
};

export type CampaignExportApproval = {
  revision: string;
  approvedAt: string;
};

export type CampaignExportInput = {
  article: HTMLElement;
  approval: CampaignExportApproval;
  preview: CampaignExportPreview;
  guard?: LocalPreviewApprovalInput;
  /** The exact local upload, when the approved packshot is an object URL. */
  packshotBlob?: Blob | null;
  document?: Document;
};

export type CampaignExportFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type CampaignExportFontNotice = {
  family: string;
  copyright: string;
  licenseName: string;
  licenseFile: string;
  files: string[];
};

export type ArchiveReferenceAudit = {
  stylesheets: string[];
  images: string[];
  fonts: string[];
  cssUrls: string[];
  checked: number;
};

export type CampaignExportReceipt = {
  schemaVersion: 1;
  kind: "campaign-lab-local-export";
  exportedAt: string;
  approval: {
    scope: "local-preview";
    revision: string;
    approvedAt: string;
    renderedRevision: string;
  };
  preview: {
    status: "preview" | "confirmed";
    notice: string | null;
    productName: string;
    brandName: string;
    offer: string;
    offerPrice?: string;
    destinationUrl: string;
    actionLabel: string;
    template: CampaignExportPreview["template"];
  };
  verification: BrowserOfferVerification | null;
  provenance?: CampaignVerificationProvenance;
  asset: {
    id: string;
    contentHash: string;
    exportedSha256: string;
    file: string;
    width: number;
    height: number;
    alt: string;
  };
  fonts: CampaignExportFontNotice[];
  references: ArchiveReferenceAudit;
  files: CampaignExportFile[];
  checks: {
    approvalRevisionMatchesRenderedRevision: true;
    renderedValuesAreCurrent: true;
    requiredImagesLoaded: true;
    editorControlsExcluded: true;
    internalNotesExcluded: true;
    allResourceReferencesResolve: true;
    htmlAndReceiptAgree: true;
    fontLicensesIncluded: true;
  };
};

export type CampaignExportResult = {
  fileName: string;
  receipt: CampaignExportReceipt;
  files: CampaignExportFile[];
  zip: Uint8Array;
};

export type CampaignExportBundle = CampaignExportResult & {
  blob: Blob;
};

type CapturedStyleNode =
  | { kind: "rule"; cssText: string }
  | { kind: "group"; header: string; children: CapturedStyleNode[] }
  | {
      kind: "font";
      family: string;
      weight: string;
      style: string;
      cssText: string;
      srcValue: string;
      baseUrl: string;
      urls: string[];
    };

export type CapturedCampaignStyleInputs = {
  nodes: CapturedStyleNode[];
  primaryFontFamily: string | null;
  bodyLetterSpacing: string | null;
  usedFontFamilies: string[];
};

export type CampaignExportSnapshot = {
  capturedAt: string;
  articleHtml: string;
  styleInputs: CapturedCampaignStyleInputs;
  approval: CampaignExportApproval;
  preview: CampaignExportPreview;
  guard: LocalPreviewApprovalInput;
  packshot: {
    blob: Blob | null;
    src: string;
    contentHash: string;
    width: number;
    height: number;
    alt: string;
  };
};

export type CampaignExportOptions = {
  signal?: AbortSignal;
  isStillApproved?: (expected: LocalPreviewApprovalInput) => boolean;
};

const FALLBACK_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const PACKSHOT_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function shortExportRevision(revision: string): string {
  return revision.slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function exportSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "campaign"
  );
}

export function campaignExportFileName(
  productName: string,
  revision: string,
): string {
  return `campaign-lab-${exportSlug(productName)}-${shortExportRevision(revision)}.zip`;
}

/** Synchronously clones and cleans the approved article before any await. */
export function captureRenderedArticle(article: HTMLElement): string {
  const clone = article.cloneNode(true) as HTMLElement;

  for (const element of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-")) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const element of Array.from(
    clone.querySelectorAll("script, style, link, iframe, object, embed"),
  )) {
    element.remove();
  }

  // A detached <img> still starts a request when src changes. Use an inert
  // data URI while the clone is serialized, then write the local path into the
  // resulting HTML so the export preparation makes no network request.
  for (const image of Array.from(clone.querySelectorAll("img"))) {
    image.setAttribute("src", PACKSHOT_PLACEHOLDER);
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.removeAttribute("fetchpriority");
  }

  return clone.outerHTML;
}

export function applyPackshotReference(
  articleHtml: string,
  packshotFile: string,
): string {
  return articleHtml.split(`src="${PACKSHOT_PLACEHOLDER}"`).join(
    `src="./${packshotFile}"`,
  );
}

/** Removes editor-only attributes, event hooks and external image URLs. */
export function sanitizeRenderedArticle(
  article: HTMLElement,
  packshotFile: string,
): string {
  return applyPackshotReference(captureRenderedArticle(article), packshotFile);
}

export function buildStandaloneDocument(input: {
  title: string;
  bodyHtml: string;
  revision: string;
  previewStatus: "preview" | "confirmed";
  previewNotice?: string;
  packshotSha256: string;
  offer?: string;
  offerPrice?: string;
  destinationUrl?: string;
  actionLabel?: string;
  packshotFile?: string;
}): string {
  const agreementMeta = [
    input.offer !== undefined
      ? `<meta name="campaign-lab-offer" content="${escapeHtml(input.offer)}">`
      : null,
    input.offerPrice !== undefined
      ? `<meta name="campaign-lab-offer-price" content="${escapeHtml(input.offerPrice)}">`
      : null,
    input.destinationUrl !== undefined
      ? `<meta name="campaign-lab-destination" content="${escapeHtml(input.destinationUrl)}">`
      : null,
    input.actionLabel !== undefined
      ? `<meta name="campaign-lab-action-label" content="${escapeHtml(input.actionLabel)}">`
      : null,
    input.packshotFile !== undefined
      ? `<meta name="campaign-lab-packshot-file" content="${escapeHtml(input.packshotFile)}">`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="campaign-lab-revision" content="${escapeHtml(input.revision)}">
<meta name="campaign-lab-preview-status" content="${escapeHtml(input.previewStatus)}">
<meta name="campaign-lab-packshot-sha256" content="${escapeHtml(input.packshotSha256)}">
${agreementMeta}
${input.previewNotice ? `<meta name="campaign-lab-preview-notice" content="${escapeHtml(input.previewNotice)}">\n` : ""}<title>${escapeHtml(input.title)}</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<div class="campaign-export-shell">
<div class="campaign-export-frame">
<div class="campaign-export-canvas">
${input.bodyHtml}
</div>
</div>
</div>
</body>
</html>
`;
}

export function buildStandaloneStylesheet(input: {
  extractedCss: string;
  primaryFontFamily: string | null;
  bodyLetterSpacing?: string | null;
}): string {
  const fontFamily = input.primaryFontFamily ?? FALLBACK_FONT_STACK;
  const letterSpacing =
    input.bodyLetterSpacing && input.bodyLetterSpacing !== "normal"
      ? input.bodyLetterSpacing
      : "normal";

  return `/* Standalone Campaign Lab export. Local preview only. */
:root {
  --font-sans: ${fontFamily};
  --font-display: ${fontFamily};
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  color-scheme: light;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}
html,
body {
  margin: 0;
  min-height: 100%;
  padding: 0;
}
body {
  background: #f5f1e8;
  letter-spacing: ${letterSpacing};
}

/*
 * The shell reproduces the editor's outer section, padding and preview-canvas
 * borders. The article therefore keeps the exact approved width at 375 px and
 * at desktop widths instead of stretching to the full browser width.
 */
.campaign-export-shell {
  width: 100%;
  max-width: 992px;
  margin: 0 auto;
  padding: 16px;
}
.campaign-export-frame {
  padding: 12px;
  border: 1px solid #d8cebd;
  border-radius: 16px;
  background: #fffdf8;
}
.campaign-export-canvas {
  overflow: hidden;
  border: 1px solid #cec3b1;
  border-radius: 12px;
  background: #fff;
}
@media (min-width: 640px) {
  .campaign-export-shell {
    padding: 24px;
  }
  .campaign-export-frame {
    padding: 16px;
    border-radius: 20px;
  }
}
@media (min-width: 1024px) {
  .campaign-export-shell {
    width: calc(100vw - 448px);
    max-width: 1152px;
    padding: 16px;
  }
}

${input.extractedCss}
`;
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function fontExtension(mimeType: string, url: string): string {
  if (mimeType.includes("woff2")) return ".woff2";
  if (mimeType.includes("woff")) return ".woff";
  if (mimeType.includes("truetype")) return ".ttf";
  if (mimeType.includes("opentype")) return ".otf";
  const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  return match ? `.${match[1].toLowerCase()}` : ".woff2";
}

function shortHashPath(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fontName(
  family: string,
  url: string,
  mimeType: string,
): string {
  const extension = fontExtension(mimeType, url);
  return `fonts/${exportSlug(family)}-${shortHashPath(url)}${extension}`;
}

function selectorUsesCampaignClass(
  selectorText: string,
  classes: ReadonlySet<string>,
): boolean {
  for (const className of classes) {
    const pattern = new RegExp(
      `\\.${escapeRegExp(className)}(?![\\w-])`,
      "i",
    );
    if (pattern.test(selectorText)) return true;
  }
  return false;
}

function captureStyleNodes(
  rules: readonly CSSRule[],
  classes: ReadonlySet<string>,
  baseUrl: string,
  usedFontFamilies: ReadonlySet<string>,
): CapturedStyleNode[] {
  const output: CapturedStyleNode[] = [];

  for (const rule of Array.from(rules)) {
    if ("selectorText" in rule && typeof rule.selectorText === "string") {
      if (selectorUsesCampaignClass(rule.selectorText, classes)) {
        output.push({ kind: "rule", cssText: rule.cssText });
      }
      continue;
    }

    // CSSRule.FONT_FACE_RULE; using the numeric type keeps this stable when
    // the browser exposes constructor names differently.
    if (rule.type === 5) {
      const fontRule = rule as CSSFontFaceRule;
      const family = unquote(fontRule.style.getPropertyValue("font-family"));
      if (!usedFontFamilies.has(family)) continue;

      const srcValue = fontRule.style.getPropertyValue("src");
      const urls: string[] = [];
      for (const match of srcValue.matchAll(/url\(([^)]+)\)/g)) {
        const rawUrl = unquote(match[1]);
        if (!rawUrl || rawUrl.startsWith("data:")) continue;
        try {
          urls.push(new URL(rawUrl, baseUrl).href);
        } catch {
          // A malformed local URL is reported when the font is resolved.
        }
      }

      // A local-only fallback face (for example Next's "Inter Fallback") is
      // not an archive dependency because it has no downloadable font file.
      if (urls.length === 0) continue;

      output.push({
        kind: "font",
        family,
        weight: fontRule.style.getPropertyValue("font-weight") || "normal",
        style: fontRule.style.getPropertyValue("font-style") || "normal",
        cssText: fontRule.cssText,
        srcValue,
        baseUrl,
        urls,
      });
      continue;
    }

    if ("cssRules" in rule) {
      const children = captureStyleNodes(
        Array.from((rule as CSSGroupingRule).cssRules),
        classes,
        baseUrl,
        usedFontFamilies,
      );
      if (children.length > 0) {
        const header = rule.cssText.slice(0, rule.cssText.indexOf("{"));
        output.push({ kind: "group", header, children });
      }
    }
  }

  return output;
}

/** Captures DOM and stylesheet inputs synchronously, before any fetch starts. */
export function captureCampaignStyleInputs(
  article: HTMLElement,
  doc: Document = document,
): CapturedCampaignStyleInputs {
  const classes = new Set<string>();
  const usedFontFamilies = new Set<string>();
  const elements = [article, ...Array.from(article.querySelectorAll("*"))];

  for (const element of elements) {
    for (const className of Array.from(element.classList)) {
      classes.add(className);
    }
    const family = doc.defaultView?.getComputedStyle(element).fontFamily ?? "";
    for (const token of family.split(",")) {
      const cleaned = unquote(token);
      if (cleaned) usedFontFamilies.add(cleaned);
    }
  }

  const nodes: CapturedStyleNode[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    nodes.push(
      ...captureStyleNodes(
        Array.from(rules),
        classes,
        sheet.href ?? doc.baseURI,
        usedFontFamilies,
      ),
    );
  }

  const articleStyle = doc.defaultView?.getComputedStyle(article);

  return {
    nodes,
    primaryFontFamily: articleStyle?.fontFamily ?? null,
    bodyLetterSpacing: articleStyle?.letterSpacing ?? null,
    usedFontFamilies: [...usedFontFamilies].sort(),
  };
}

export function captureCampaignExportSnapshot(
  input: CampaignExportInput,
): CampaignExportSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    articleHtml: captureRenderedArticle(input.article),
    styleInputs: captureCampaignStyleInputs(
      input.article,
      input.document ?? document,
    ),
    approval: { ...input.approval },
    preview: {
      ...input.preview,
      template: { ...input.preview.template },
      asset: { ...input.preview.asset },
      verification: input.preview.verification
        ? { ...input.preview.verification }
        : null,
      provenance: input.preview.provenance
        ? JSON.parse(JSON.stringify(input.preview.provenance))
        : undefined,
    },
    guard: input.guard ?? {
      revision: input.preview.revision,
      approvalRevision: input.approval.revision,
      dirty: false,
      generating: false,
      imagesReady: true,
    },
    packshot: {
      blob: input.packshotBlob ?? null,
      src: input.preview.asset.src,
      contentHash: input.preview.asset.contentHash,
      width: input.preview.asset.width,
      height: input.preview.asset.height,
      alt: input.preview.asset.alt,
    },
  };
}

type ResolvedFont = {
  path: string;
  bytes: Uint8Array;
  mimeType: string;
  family: string;
  url: string;
};

type ResolvedStyles = {
  css: string;
  fonts: ResolvedFont[];
  licenseFiles: Array<{ path: string; bytes: Uint8Array }>;
  noticeFile: { path: string; bytes: Uint8Array } | null;
  notices: CampaignExportFontNotice[];
};

function assertCanContinue(
  expected: LocalPreviewApprovalInput,
  options: CampaignExportOptions,
): void {
  if (options.signal?.aborted) throw new CampaignExportCancelledError();
  if (options.isStillApproved && !options.isStillApproved(expected)) {
    throw new CampaignExportCancelledError();
  }
}

function walkFontNodes(nodes: readonly CapturedStyleNode[]): Array<{
  node: Extract<CapturedStyleNode, { kind: "font" }>;
}> {
  const output: Array<{
    node: Extract<CapturedStyleNode, { kind: "font" }>;
  }> = [];
  for (const node of nodes) {
    if (node.kind === "font") output.push({ node });
    else if (node.kind === "group") output.push(...walkFontNodes(node.children));
  }
  return output;
}

function nodesToCss(
  nodes: readonly CapturedStyleNode[],
  fontPaths: ReadonlyMap<string, string>,
): string {
  return nodes
    .map((node) => {
      if (node.kind === "rule") return node.cssText;
      if (node.kind === "group") {
        return `${node.header}{${nodesToCss(node.children, fontPaths)}}`;
      }
      if (node.urls.length === 0) return "";
      let rewritten = node.srcValue;
      for (const match of node.srcValue.matchAll(/url\(([^)]+)\)/g)) {
        const rawUrl = unquote(match[1]);
        if (!rawUrl || rawUrl.startsWith("data:")) continue;
        const absolute = (() => {
          try {
            return new URL(rawUrl, node.baseUrl).href;
          } catch {
            return rawUrl;
          }
        })();
        const path = fontPaths.get(absolute);
        if (!path) {
          throw new CampaignExportFontError(
            `The required ${node.family} font reference could not be packaged (${rawUrl}). Retry the export after reloading Campaign Lab. No download was created.`,
          );
        }
        rewritten = rewritten.replace(match[0], `url("./${path}")`);
      }
      return node.cssText.replace(node.srcValue, rewritten);
    })
    .join("\n");
}

async function resolveCapturedStyles(
  styleInputs: CapturedCampaignStyleInputs,
  options: CampaignExportOptions,
  expectedGuard: LocalPreviewApprovalInput,
): Promise<ResolvedStyles> {
  const fontNodes = walkFontNodes(styleInputs.nodes).map((entry) => entry.node);
  const families = [...new Set(fontNodes.map((node) => node.family))].sort();
  const licenses = new Map<string, BundledFontLicense>();

  for (const family of families) {
    const license = findFontLicense(family);
    if (!license) {
      throw new CampaignExportFontError(
        `The export cannot bundle the required ${family} font because no matching copyright and license text is configured. Add its OFL notice before exporting. No download was created.`,
      );
    }
    licenses.set(family, license);
  }

  const urls = new Map<string, { family: string; path: string }>();
  const fonts: ResolvedFont[] = [];

  for (const node of fontNodes) {
    for (const url of node.urls) {
      if (urls.has(url)) continue;
      assertCanContinue(expectedGuard, options);

      let response: Response;
      try {
        response = await fetch(url, {
          cache: "no-store",
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw new CampaignExportCancelledError();
        throw new CampaignExportFontError(
          `The required ${node.family} font could not be packaged from ${url}: ${
            error instanceof Error ? error.message : "network failure"
          }. Check the local font asset and retry the export. No download was created.`,
        );
      }

      if (!response.ok) {
        throw new CampaignExportFontError(
          `The required ${node.family} font could not be packaged: HTTP ${response.status} from ${url}. Reload Campaign Lab or rebuild the font asset, then retry the export. No download was created.`,
        );
      }

      const mimeType =
        response.headers.get("content-type")?.split(";")[0].trim() ||
        "font/woff2";
      const path = fontName(node.family, url, mimeType);
      urls.set(url, { family: node.family, path });
      fonts.push({
        path,
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType,
        family: node.family,
        url,
      });
    }
  }

  assertCanContinue(expectedGuard, options);

  const fontPaths = new Map(
    [...urls.entries()].map(([url, entry]) => [url, entry.path]),
  );
  const css = nodesToCss(styleInputs.nodes, fontPaths);
  const encoder = new TextEncoder();
  const notices: CampaignExportFontNotice[] = [];
  const licenseFiles = new Map<string, { path: string; bytes: Uint8Array }>();

  for (const family of families) {
    const license = licenses.get(family);
    if (!license) continue;
    const files = fonts
      .filter((font) => font.family === family)
      .map((font) => font.path);
    notices.push({
      family,
      copyright: license.copyright,
      licenseName: license.licenseName,
      licenseFile: license.licenseFile,
      files,
    });
    licenseFiles.set(license.licenseFile, {
      path: license.licenseFile,
      bytes: encoder.encode(license.licenseText),
    });
  }

  const noticeFile =
    notices.length > 0
      ? {
          path: "fonts/NOTICE.txt",
          bytes: encoder.encode(
            buildFontNotice(
              notices.flatMap((notice) =>
                notice.files.map((file) => ({
                  family: notice.family,
                  file,
                  license: licenses.get(notice.family)!,
                })),
              ),
            ),
          ),
        }
      : null;

  return {
    css,
    fonts,
    licenseFiles: [...licenseFiles.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    noticeFile,
    notices,
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = pattern.exec(html);
  return match ? decodeHtml(match[1]) : null;
}

function tagAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, "i");
  const match = pattern.exec(tag);
  return match ? match[1] : null;
}

function normalizeArchivePath(reference: string): string {
  return decodeURIComponent(reference.split("#")[0].split("?")[0]).replace(
    /^\.\//,
    "",
  );
}

function isExternalReference(reference: string): boolean {
  return /^(?:https?:)?\/\//i.test(reference);
}

export function auditArchiveReferences(
  html: string,
  css: string,
  filePaths: readonly string[],
): ArchiveReferenceAudit {
  const available = new Set(filePaths);
  const stylesheets: string[] = [];
  const images: string[] = [];
  const fonts: string[] = [];
  const cssUrls: string[] = [];
  const missing: string[] = [];
  const external: string[] = [];
  let checked = 0;

  for (const match of html.matchAll(/<(?:link|img)\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tagAttribute(tag, "rel");
    const href = tagAttribute(tag, "href");
    const src = tagAttribute(tag, "src");
    const reference =
      rel?.toLowerCase() === "stylesheet" && href
        ? href
        : tag.toLowerCase().startsWith("<img") && src
          ? src
          : null;
    if (!reference) continue;
    checked += 1;
    if (isExternalReference(reference)) {
      external.push(reference);
      continue;
    }
    const normalized = normalizeArchivePath(reference);
    if (rel?.toLowerCase() === "stylesheet") stylesheets.push(normalized);
    else images.push(normalized);
    if (!available.has(normalized)) missing.push(normalized);
  }

  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    const reference = match[2].trim();
    if (!reference || reference.startsWith("data:")) continue;
    checked += 1;
    if (isExternalReference(reference)) {
      external.push(reference);
      continue;
    }
    const normalized = normalizeArchivePath(reference);
    cssUrls.push(normalized);
    if (normalized.startsWith("fonts/")) fonts.push(normalized);
    if (!available.has(normalized)) missing.push(normalized);
  }

  if (external.length > 0) {
    throw new CampaignExportReferenceError(
      `The export contains external resource references (${[
        ...new Set(external),
      ].join(", ")}). Bundle the assets locally before exporting. No download was created.`,
    );
  }
  if (missing.length > 0) {
    throw new CampaignExportReferenceError(
      `The export archive is missing referenced resources: ${[
        ...new Set(missing),
      ].join(", ")}. The download was stopped before an incomplete bundle was produced.`,
    );
  }

  return {
    stylesheets: [...new Set(stylesheets)].sort(),
    images: [...new Set(images)].sort(),
    fonts: [...new Set(fonts)].sort(),
    cssUrls: [...new Set(cssUrls)].sort(),
    checked,
  };
}

export function assertHtmlReceiptAgreement(
  html: string,
  receipt: CampaignExportReceipt,
): void {
  const checks: Array<[string, string | null, string]> = [
    [
      "revision",
      metaContent(html, "campaign-lab-revision"),
      receipt.approval.revision,
    ],
    [
      "offer",
      metaContent(html, "campaign-lab-offer"),
      receipt.preview.offer,
    ],
    [
      "destination",
      metaContent(html, "campaign-lab-destination"),
      receipt.preview.destinationUrl,
    ],
    [
      "packshot file",
      metaContent(html, "campaign-lab-packshot-file"),
      receipt.asset.file,
    ],
    [
      "packshot hash",
      metaContent(html, "campaign-lab-packshot-sha256"),
      receipt.asset.exportedSha256,
    ],
  ];

  if (receipt.preview.offerPrice !== undefined) {
    checks.push([
      "offer price",
      metaContent(html, "campaign-lab-offer-price"),
      receipt.preview.offerPrice,
    ]);
  }

  for (const [label, htmlValue, receiptValue] of checks) {
    if (htmlValue !== receiptValue) {
      throw new CampaignExportIntegrityError(
        `The exported HTML and receipt disagree on the ${label}. The download was stopped before an inconsistent bundle was produced.`,
      );
    }
  }
}

export async function sha256Hex(
  data: Uint8Array | string,
): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type PackshotBytes = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
};

async function readPackshotBytes(
  src: string,
  upload: Blob | null | undefined,
  signal?: AbortSignal,
): Promise<PackshotBytes> {
  let bytes: ArrayBuffer;
  let mimeType: string;

  if (upload) {
    bytes = await upload.arrayBuffer();
    mimeType = upload.type || "application/octet-stream";
  } else {
    let response: Response;
    try {
      response = await fetch(src, { cache: "no-store", signal });
    } catch (error) {
      if (signal?.aborted) throw new CampaignExportCancelledError();
      throw new Error(
        `The approved packshot could not be read: ${
          error instanceof Error ? error.message : "network failure"
        }.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `The approved packshot could not be read (HTTP ${response.status}).`,
      );
    }
    bytes = await response.arrayBuffer();
    mimeType =
      response.headers.get("content-type")?.split(";")[0].trim() ||
      "application/octet-stream";
  }

  const extension =
    mimeType === "image/png"
      ? ".png"
      : mimeType === "image/webp"
        ? ".webp"
        : mimeType === "image/jpeg"
          ? ".jpg"
          : mimeType === "image/svg+xml"
            ? ".svg"
            : ".bin";
  return {
    bytes: new Uint8Array(bytes),
    mimeType,
    extension,
  };
}

export async function buildExportReceipt(input: {
  preview: CampaignExportPreview;
  approval: CampaignExportApproval;
  exportedAt: string;
  packshotFile: string;
  packshotSha256: string;
  files: CampaignExportFile[];
  fonts?: CampaignExportFontNotice[];
  references?: ArchiveReferenceAudit;
}): Promise<CampaignExportReceipt> {
  return {
    schemaVersion: 1,
    kind: "campaign-lab-local-export",
    exportedAt: input.exportedAt,
    approval: {
      scope: "local-preview",
      revision: input.approval.revision,
      approvedAt: input.approval.approvedAt,
      renderedRevision: input.preview.revision,
    },
    preview: {
      status: input.preview.status,
      notice: input.preview.notice ?? null,
      productName: input.preview.productName,
      brandName: input.preview.brandName,
      offer: input.preview.offer,
      ...(input.preview.offerPrice !== undefined
        ? { offerPrice: input.preview.offerPrice }
        : {}),
      destinationUrl: input.preview.destinationUrl,
      actionLabel: input.preview.actionLabel,
      template: input.preview.template,
    },
    verification: input.preview.verification ?? null,
    ...(input.preview.provenance
      ? { provenance: input.preview.provenance }
      : {}),
    asset: {
      id: input.preview.asset.id,
      contentHash: input.preview.asset.contentHash,
      exportedSha256: input.packshotSha256,
      file: input.packshotFile,
      width: input.preview.asset.width,
      height: input.preview.asset.height,
      alt: input.preview.asset.alt,
    },
    fonts: input.fonts ?? [],
    references: input.references ?? {
      stylesheets: [],
      images: [],
      fonts: [],
      cssUrls: [],
      checked: 0,
    },
    files: input.files,
    checks: {
      approvalRevisionMatchesRenderedRevision: true,
      renderedValuesAreCurrent: true,
      requiredImagesLoaded: true,
      editorControlsExcluded: true,
      internalNotesExcluded: true,
      allResourceReferencesResolve: true,
      htmlAndReceiptAgree: true,
      fontLicensesIncluded: true,
    },
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

/** Minimal stored ZIP writer so the export has no runtime dependency. */
export function createStoredZip(
  entries: readonly ZipEntry[],
  now: Date = new Date(),
): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const stamp = dosDateTime(now);
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const total =
    localParts.reduce((sum, part) => sum + part.length, 0) +
    centralSize +
    end.length;
  const zip = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  return zip;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function buildCampaignExportBundle(
  snapshot: CampaignExportSnapshot,
  options: CampaignExportOptions = {},
): Promise<CampaignExportBundle> {
  if (snapshot.approval.revision !== snapshot.preview.revision) {
    throw new Error(
      "The approved revision does not match the rendered revision.",
    );
  }

  assertCanContinue(snapshot.guard, options);

  const packshot = await readPackshotBytes(
    snapshot.packshot.src,
    snapshot.packshot.blob,
    options.signal,
  );
  assertCanContinue(snapshot.guard, options);

  const packshotSha256 = await sha256Hex(packshot.bytes);
  if (packshotSha256 !== snapshot.preview.asset.contentHash.toLowerCase()) {
    throw new Error(
      "The packshot bytes do not match the approved SHA-256. Reselect the approved file before exporting.",
    );
  }

  const styles = await resolveCapturedStyles(
    snapshot.styleInputs,
    options,
    snapshot.guard,
  );
  assertCanContinue(snapshot.guard, options);

  const packshotFile = `packshot-${snapshot.preview.asset.contentHash.slice(0, 16)}${packshot.extension}`;
  const bodyHtml = applyPackshotReference(
    snapshot.articleHtml,
    packshotFile,
  );
  const html = buildStandaloneDocument({
    title: `${snapshot.preview.productName} — ${snapshot.preview.brandName}`,
    bodyHtml,
    revision: snapshot.preview.revision,
    previewStatus: snapshot.preview.status,
    previewNotice: snapshot.preview.notice,
    packshotSha256,
    offer: snapshot.preview.offer,
    offerPrice: snapshot.preview.offerPrice,
    destinationUrl: snapshot.preview.destinationUrl,
    actionLabel: snapshot.preview.actionLabel,
    packshotFile,
  });
  const css = buildStandaloneStylesheet({
    extractedCss: styles.css,
    primaryFontFamily: snapshot.styleInputs.primaryFontFamily,
    bodyLetterSpacing: snapshot.styleInputs.bodyLetterSpacing,
  });

  const encoder = new TextEncoder();
  const htmlBytes = encoder.encode(html);
  const cssBytes = encoder.encode(css);
  const readme = `Campaign Lab local export\n\nRevision: ${snapshot.preview.revision}\nOffer: ${snapshot.preview.offer}\nDestination: ${snapshot.preview.destinationUrl}\nApproval scope: local-preview\nPreview status: ${snapshot.preview.status}\n${snapshot.preview.notice ? `Provisional notice: ${snapshot.preview.notice}\n` : ""}\nOpen index.html directly in a browser. No server, build step, or Ornigami runtime is required.\n\nThis is a local preview artifact, not publication approval. Editor controls, internal source notes and campaign-brief data are intentionally excluded.\n\nBundled fonts retain their matching copyright and license text in fonts/NOTICE.txt and the referenced license files.\n`;
  const readmeBytes = encoder.encode(readme);

  const filesWithoutReceipt: Array<{ path: string; bytes: Uint8Array }> = [
    { path: "index.html", bytes: htmlBytes },
    { path: "styles.css", bytes: cssBytes },
    { path: packshotFile, bytes: packshot.bytes },
    ...styles.fonts.map((font) => ({ path: font.path, bytes: font.bytes })),
    ...styles.licenseFiles,
    ...(styles.noticeFile ? [styles.noticeFile] : []),
    { path: "README.txt", bytes: readmeBytes },
  ];

  const referenceAudit = auditArchiveReferences(
    html,
    css,
    filesWithoutReceipt.map((file) => file.path),
  );

  const exportFiles: CampaignExportFile[] = [];
  for (const file of filesWithoutReceipt) {
    exportFiles.push({
      path: file.path,
      bytes: file.bytes.length,
      sha256: await sha256Hex(file.bytes),
    });
  }

  const receipt = await buildExportReceipt({
    preview: snapshot.preview,
    approval: snapshot.approval,
    exportedAt: new Date().toISOString(),
    packshotFile,
    packshotSha256,
    files: exportFiles.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    fonts: styles.notices,
    references: referenceAudit,
  });
  assertHtmlReceiptAgreement(html, receipt);
  assertCanContinue(snapshot.guard, options);

  const receiptBytes = encoder.encode(`${JSON.stringify(receipt, null, 2)}\n`);
  const zip = createStoredZip([
    ...filesWithoutReceipt,
    { path: "receipt.json", bytes: receiptBytes },
  ]);

  assertCanContinue(snapshot.guard, options);

  return {
    fileName: campaignExportFileName(
      snapshot.preview.productName,
      snapshot.preview.revision,
    ),
    receipt,
    files: [
      ...exportFiles,
      {
        path: "receipt.json",
        bytes: receiptBytes.length,
        sha256: await sha256Hex(receiptBytes),
      },
    ],
    zip,
    blob: new Blob([bytesToArrayBuffer(zip)], { type: "application/zip" }),
  };
}

export function downloadCampaignExport(bundle: CampaignExportBundle): void {
  const url = URL.createObjectURL(bundle.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = bundle.fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
