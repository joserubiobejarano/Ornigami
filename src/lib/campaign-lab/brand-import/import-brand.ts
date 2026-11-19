import { createHash } from "node:crypto";
import { collectBrandKitDraft } from "./brand-evidence.ts";
import { BRAND_EVIDENCE_LIMITS as E, type BrandKitDraft, type SuppliedBrandResource } from "./evidence-types.ts";
import { discoverHtmlResources } from "./html-discovery.ts";
import { ResourceReadError, resourceClock, type PublicResource, type ResourceReadOptions, type ResourceClock } from "./public-resource-fetch.ts";

const caveats = new Set(["sampled-srgb-not-original-pixel-palette", "image-purpose-and-rights-unknown"]);
const failedExtraction = (s: BrandKitDraft["sources"][number]) => s.outcome !== "processed" || s.issues.some(i => !caveats.has(i));

export const BRAND_IMPORT_LIMITS = Object.freeze({
  resources: E.resources, totalBytes: E.totalBytes, networkMs: 10_000,
  redirects: 2, tags: 256, rasters: E.rasterCount,
});
export const BRAND_TEXT_IMPORT_LIMITS = Object.freeze({
  resources: 4, totalBytes: 1024 * 1024, networkMs: 10_000,
  redirects: 2, tags: 128, rasters: 0,
});
type Limits = { [K in keyof typeof BRAND_IMPORT_LIMITS]: number };
export type BrandResourceReader = (url: string, options: ResourceReadOptions) => Promise<PublicResource>;
type Entry = {
  kind: SuppliedBrandResource["kind"]; requestedUrl: string; finalUrl: string | null;
  bytes: number; sha256: string | null; status: number | null; error: string | null;
};
export type ImportLedger = {
  version: "ornigami-brand-import/1.0.0" | "ornigami-brand-import/1.1.0"; extractorVersion: BrandKitDraft["extractorVersion"];
  status: "complete" | "partial" | "incomplete" | "rejected" | "cancelled";
  limits: Limits; logicalReads: number; maxHttpAttempts: number; scheduledHttpAttemptBound: number;
  retainedBytes: number; chargedBytes: number; cancellation: "CANCELLED" | "DEADLINE" | null;
  discoveryTags: number; issues: string[]; entries: Entry[];
  resourcePolicy?: "html-css/1.0.0";
  evidenceNotes?: string[];
  evidenceWarnings?: { sourceId: string; issues: string[] }[];
  extractionFailures: { sourceId: string; outcome: string; issues: string[] }[];
};

/** Node-only library. Dependencies/options are trusted application configuration.
 * No default reader: callers must explicitly choose the protected adapter.
 */
export async function importBrandDraft(seed: string, reader: BrandResourceReader, options: {
  signal?: AbortSignal; limits?: Partial<Limits>; clock?: ResourceClock;
  resourcePolicy?: "html-css";
} = {}): Promise<{ draft: BrandKitDraft | null; ledger: ImportLedger; resources: SuppliedBrandResource[] }> {
  if (options.resourcePolicy !== undefined && options.resourcePolicy !== "html-css") throw new TypeError("Unknown trusted resource policy");
  const textOnly = options.resourcePolicy === "html-css";
  const caps = textOnly ? BRAND_TEXT_IMPORT_LIMITS : BRAND_IMPORT_LIMITS;
  const limits = { ...caps, ...options.limits };
  for (const key of Object.keys(limits) as (keyof Limits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < (key === "redirects" || (textOnly && key === "rasters") ? 0 : 1) || limits[key] > caps[key]) {
      throw new TypeError("Invalid trusted import limits");
    }
  }
  const clock = options.clock ?? resourceClock;
  const expires = clock.now() + limits.networkMs;
  const controller = new AbortController();
  const ledger: ImportLedger = {
    version: "ornigami-brand-import/1.1.0", extractorVersion: "ornigami-brand-evidence/1.0.0",
    status: "rejected", limits, logicalReads: 0, maxHttpAttempts: limits.resources * (limits.redirects + 1),
    scheduledHttpAttemptBound: 0, retainedBytes: 0, chargedBytes: 0, cancellation: null,
    ...(textOnly ? { resourcePolicy: "html-css/1.0.0" as const, evidenceNotes: ["HTML_CSS_ONLY"] } : {}),
    discoveryTags: 0, issues: [], entries: [], extractionFailures: [],
  };
  const resources: SuppliedBrandResource[] = [];
  const seen = new Set<string>();
  const issue = (code: string) => { if (!ledger.issues.includes(code)) ledger.issues.push(code); };
  const cancel = (code: "CANCELLED" | "DEADLINE") => {
    if (!controller.signal.aborted) { ledger.cancellation = code; controller.abort(); }
  };
  const externalAbort = () => cancel("CANCELLED");
  if (options.signal?.aborted) externalAbort();
  else options.signal?.addEventListener("abort", externalAbort, { once: true });
  const clearTimer = clock.schedule(() => cancel("DEADLINE"), limits.networkMs);
  const check = () => {
    if (clock.now() >= expires) cancel("DEADLINE");
    return !controller.signal.aborted;
  };
  const read = async (raw: string, kind: SuppliedBrandResource["kind"]) => {
    if (!check()) return;
    let url: URL;
    try {
      if (raw.length > E.urlChars) throw new Error();
      url = new URL(raw); url.hash = "";
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
      if (url.hostname.endsWith(".")) url.hostname = url.hostname.slice(0, -1);
      if (url.href.length > E.urlChars) throw new Error();
    } catch { issue("INVALID_REFERENCE"); return; }
    if (seen.has(url.href)) { issue("DUPLICATE_REFERENCE"); return; }
    if (ledger.logicalReads >= limits.resources) { issue("RESOURCE_LIMIT"); return; }
    const maxBytes = Math.min(kind === "css" ? E.cssBytes : E.htmlBytes, limits.totalBytes - ledger.chargedBytes);
    if (maxBytes < 1) { issue("BYTE_BUDGET"); return; }
    seen.add(url.href);
    const entry: Entry = { kind, requestedUrl: url.href, finalUrl: null, bytes: 0, sha256: null, status: null, error: null };
    ledger.entries.push(entry); ledger.logicalReads++;
    ledger.scheduledHttpAttemptBound += limits.redirects + 1;
    // Reserve the entire allowance. On failure it remains charged, since the
    // reader may have received a partial entity without returning its bytes.
    ledger.chargedBytes += maxBytes;
    try {
      const result = await reader(url.href, { maxBytes, timeoutMs: Math.max(1, Math.floor(expires - clock.now())),
        maxRedirects: limits.redirects, signal: controller.signal, deadline: expires });
      if (!check()) { entry.error = ledger.cancellation; return; }
      if (result.body.byteLength > maxBytes) throw new Error();
      entry.bytes = result.body.byteLength;
      entry.sha256 = createHash("sha256").update(result.body).digest("hex");
      entry.status = result.status;
      ledger.retainedBytes += entry.bytes;
      ledger.chargedBytes -= maxBytes - entry.bytes;
      if (result.requestedUrl.length > E.urlChars || result.finalUrl.length > E.urlChars || (result.contentType?.length ?? 0) > E.evidenceChars) {
        entry.error = "METADATA_LIMIT"; return;
      }
      entry.finalUrl = result.finalUrl;
      const final = new URL(result.finalUrl); final.hash = ""; seen.add(final.href);
      const resource = { ...result, body: Uint8Array.from(result.body), kind };
      resources.push(resource);
      return resource;
    } catch (error) {
      if (error instanceof ResourceReadError && error.code === "DEADLINE") cancel("DEADLINE");
      check();
      entry.error = ledger.cancellation ?? (error instanceof ResourceReadError ? error.code : "READER_FAILED");
    }
  };
  let draft: BrandKitDraft | null = null;
  try {
    const html = await read(seed, "html");
    if (html && check()) {
      draft = await collectBrandKitDraft([html]);
      if (check() && draft.sources[0]?.outcome === "processed") {
        const discovery = discoverHtmlResources(new TextDecoder("utf-8", { ignoreBOM: true }).decode(html.body), html.finalUrl, limits.tags);
        ledger.discoveryTags = discovery.tags;
        discovery.issues.forEach(issue);
        let rasters = 0;
        for (const candidate of discovery.resources) {
          if (!check()) break;
          if (textOnly && candidate.kind !== "css") {
            if (!ledger.evidenceNotes!.includes("MEDIA_NOT_FETCHED")) ledger.evidenceNotes!.push("MEDIA_NOT_FETCHED");
            continue;
          }
          if (ledger.logicalReads >= limits.resources) { issue("RESOURCE_LIMIT"); break; }
          if (ledger.chargedBytes >= limits.totalBytes) { issue("BYTE_BUDGET"); break; }
          if (candidate.kind === "raster" && rasters++ >= limits.rasters) { issue("RASTER_LIMIT"); continue; }
          await read(candidate.url, candidate.kind);
        }
        if (check()) draft = await collectBrandKitDraft(resources);
        ledger.status = draft.outcome === "draft" ? "complete" : "incomplete";
        if (ledger.entries.some(e => e.error) || ledger.issues.length || draft.sources.some(failedExtraction)) ledger.status = "partial";
      }
    }
    // Collection/native decoding is not preemptible. Recheck after every await;
    // a late result may never publish as a successful draft.
    if (!check()) { draft = null; ledger.status = "cancelled"; }
    if (draft && textOnly) draft.gaps.push("URL review reads HTML and directly linked CSS only; images, fonts, scripts and recursive CSS imports are not fetched. No rendered/computed styles.");
    if (draft) ledger.extractionFailures = draft.sources.filter(failedExtraction)
      .map(s => ({ sourceId: s.id, outcome: s.outcome, issues: s.issues }));
    if (draft) ledger.evidenceWarnings = draft.sources.filter(s => s.issues.length).map(s => ({ sourceId: s.id, issues: [...s.issues] }));
    if (draft && ledger.status !== "complete") draft.gaps.push("Import evidence is incomplete: inspect the bounded import ledger for missing resources and failures.");
    return { draft, ledger, resources };
  } finally {
    clearTimer(); options.signal?.removeEventListener("abort", externalAbort);
  }
}
