import { createHash } from "node:crypto";

export const APPROVAL_INVALIDATED_PATTERN = /\b(?:not\s+approved|unapproved|approval\s+(?:lost|invalid|invalidated|required|expired)|changes?\s+(?:made\s+)?(?:since|after)|re-?approve|needs?\s+(?:re-?approval|approval))\b/i;
export const APPROVED_PATTERN = /\bapproved\b/i;

export function normalizeText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

export function comparableText(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

export function normalizeVolatileText(value) {
  return normalizeText(value)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "{time}")
    .replace(/\b(?:just now|a few seconds ago|\d+\s+seconds?\s+ago)\b/gi, "{time}");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Classify the visible approval state without trusting a single implementation.
 * Explicit data/aria state wins over prose. Unknown is a first-class result so a
 * missing contract is reported instead of being mistaken for approval.
 */
export function classifyApproval(signals = {}) {
  const dataApproved = String(signals.dataApproved ?? "").trim().toLowerCase();
  if (dataApproved === "true") return { state: "approved", evidence: "data-approved=true" };
  if (dataApproved === "false") return { state: "not-approved", evidence: "data-approved=false" };

  const ariaPressed = String(signals.ariaPressed ?? "").trim().toLowerCase();
  if (ariaPressed === "true") return { state: "approved", evidence: "approve-control aria-pressed=true" };
  if (ariaPressed === "false") return { state: "not-approved", evidence: "approve-control aria-pressed=false" };

  const text = comparableText(signals.statusText);
  if (text && APPROVAL_INVALIDATED_PATTERN.test(text)) {
    return { state: "not-approved", evidence: `status text: ${text.slice(0, 180)}` };
  }
  if (text && APPROVED_PATTERN.test(text)) {
    return { state: "approved", evidence: `status text: ${text.slice(0, 180)}` };
  }
  return { state: "unknown", evidence: text ? `status text did not identify approval: ${text.slice(0, 180)}` : "no approval state exposed" };
}

/**
 * Validate a user-entered destination. Only absolute http(s) URLs without
 * credentials are accepted; the exact string is preserved for destination
 * equality checks.
 */
export function evaluateDestination(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { valid: false, reason: "empty", message: "Enter a destination URL." };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { valid: false, reason: "not-a-url", message: "Enter a complete URL, including https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, reason: "scheme", message: "Use an http or https URL." };
  }
  if (!url.hostname) return { valid: false, reason: "hostname", message: "Enter a URL with a host name." };
  if (url.username || url.password) {
    return { valid: false, reason: "credentials", message: "Remove credentials from the URL." };
  }
  return { valid: true, href: url.href, protocol: url.protocol, hostname: url.hostname };
}

export function replaceAllText(value, replacements) {
  let result = String(value ?? "");
  for (const [from, to] of replacements) {
    if (!from) continue;
    result = result.split(from).join(to);
  }
  return normalizeVolatileText(result);
}

/**
 * Compare the preview's copy before and after an offer/destination edit.
 * Offer and destination replacements are applied to the "before" text; all
 * remaining differences are unrelated-content changes. Clock-like text is
 * normalized so a generated-at label does not look like a content change.
 */
export function unrelatedCopyDiff(before, after, replacements) {
  const expected = replaceAllText(before, replacements);
  const observed = normalizeVolatileText(after);
  if (expected === observed) return null;
  const expectedLines = expected.split("\n");
  const observedLines = observed.split("\n");
  const limit = Math.max(expectedLines.length, observedLines.length);
  for (let index = 0; index < limit; index += 1) {
    if (expectedLines[index] === observedLines[index]) continue;
    return {
      line: index + 1,
      expected: expectedLines[index] ?? null,
      observed: observedLines[index] ?? null,
    };
  }
  return { line: null, expected: expected.slice(0, 300), observed: observed.slice(0, 300) };
}

export function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
}

export function requiredContrast(fontSizePx, fontWeight) {
  const bold = Number(fontWeight) >= 700;
  const large = Number(fontSizePx) >= 24 || (bold && Number(fontSizePx) >= 18.66);
  return large ? 3 : 4.5;
}

export function safeSegment(value) {
  return String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "item";
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return { ok: false, errors: ["manifest is not an object"] };
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!["approved", "proposed"].includes(manifest.status)) errors.push('status must be "approved" or "proposed"');
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) errors.push("fixtures must be a non-empty array");
  const names = new Set();
  for (const [index, fixture] of (manifest.fixtures ?? []).entries()) {
    const prefix = `fixtures[${index}]`;
    if (!fixture || typeof fixture !== "object") {
      errors.push(`${prefix} is not an object`);
      continue;
    }
    if (!/^[a-z0-9-]+$/.test(fixture.name ?? "")) errors.push(`${prefix}.name must use lowercase letters, digits or hyphens`);
    if (names.has(fixture.name)) errors.push(`${prefix}.name is duplicated`);
    names.add(fixture.name);
    if (!fixture.url || typeof fixture.url !== "string") errors.push(`${prefix}.url is required`);
    if (!fixture.product || typeof fixture.product.name !== "string") errors.push(`${prefix}.product.name is required`);
    if (!fixture.product || typeof fixture.product.label !== "string") errors.push(`${prefix}.product.label is required`);
    if (!fixture.image || typeof fixture.image !== "object") errors.push(`${prefix}.image is required`);
    if (fixture.destination != null && evaluateDestination(fixture.destination).valid === false) {
      errors.push(`${prefix}.destination is not a valid absolute http(s) URL`);
    }
    if (manifest.status === "approved") {
      if (!fixture.offer) errors.push(`${prefix}.offer is required when status is approved`);
      if (!fixture.destination) errors.push(`${prefix}.destination is required when status is approved`);
      if (!fixture.image?.path) errors.push(`${prefix}.image.path is required when status is approved`);
      if (!fixture.image?.alt) errors.push(`${prefix}.image.alt is required when status is approved`);
      if (fixture.image?.sha256 != null && !/^[a-f0-9]{64}$/i.test(fixture.image.sha256)) {
        errors.push(`${prefix}.image.sha256 must be a 64-character hex digest`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function hasApprovedMetadata(fixture) {
  return Boolean(
    fixture &&
    fixture.destination &&
    fixture.offer &&
    fixture.image?.path &&
    fixture.image?.alt &&
    fixture.product?.name &&
    fixture.product?.label,
  );
}
