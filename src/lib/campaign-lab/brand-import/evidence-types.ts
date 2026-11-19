/** Offline evidence contract. Structurally compatible with the separate transport. */
export type SuppliedBrandResource = {
  kind: "html" | "css" | "raster";
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: Uint8Array;
};

export const BRAND_EVIDENCE_LIMITS = Object.freeze({
  resources: 12,
  totalBytes: 4 * 1024 * 1024,
  htmlBytes: 512 * 1024,
  cssBytes: 256 * 1024,
  rasterBytes: 512 * 1024,
  rasterCount: 4,
  rasterPixels: 4_000_000,
  sampleSide: 64,
  candidates: 256,
  evidenceChars: 240,
  textChars: 4000,
  urlChars: 2048,
});

export type EvidenceSource = Omit<SuppliedBrandResource, "body"> & {
  id: string;
  byteLength: number;
  sha256: string;
  outcome: "processed" | "unsupported" | "rejected";
  issues: string[];
};

export type EvidenceCandidate = {
  id: string;
  sourceId: string;
  sourceSha256: string;
  method: "html-title" | "html-description" | "html-text" | "html-reference" |
    "css-reference" | "css-declaration" | "html-theme-color" | "raster-sample";
  category: "title" | "description" | "text" | "reference" | "ui-color" | "raster-color";
  observed: string;
  /** Exact decoded-source substring, or a bounded raster sampling description. */
  evidence: { quote: string; utf16Offset: number | null };
  details: Record<string, string | number | boolean>;
  roleHint: { value: string; reason: string } | null;
  confidence: { level: "low" | "medium"; reason: string; calibrated: false };
  uncertainty: string[];
  reviewStatus: "unreviewed";
};

export type BrandKitDraft = {
  schemaVersion: "1.0.0";
  extractorVersion: "ornigami-brand-evidence/1.0.0";
  outcome: "draft" | "incomplete" | "unsupported";
  sources: EvidenceSource[];
  candidates: EvidenceCandidate[];
  /** Nothing in this phase can approve identity, claims, destinations or rights. */
  acceptedValues: [];
  approvals: { brand: false; campaignFacts: false; mediaRights: false };
  gaps: string[];
  limits: typeof BRAND_EVIDENCE_LIMITS;
};
