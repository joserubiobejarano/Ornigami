import { BRAND_EVIDENCE_LIMITS as L } from "./evidence-types.ts";

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, name: string) => {
    if (name[0] !== "#") return named[name.toLowerCase()] ?? raw;
    const n = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
  });
}
/** Replaces inert blocks with spaces, retaining UTF-16 offsets in the original. */
export function activeHtml(s: string): string {
  return s.replace(/<!--[\s\S]*?(?:-->|$)|<(script|template|svg|noscript|iframe)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
    value => " ".repeat(value.length));
}

type Attr = { value: string; offset: number };
export function attributes(tag: string, offset: number): Map<string, Attr> {
  const result = new Map<string, Attr>();
  const pattern = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const m of tag.matchAll(pattern)) {
    const raw = m[2] ?? m[3] ?? m[4];
    const start = m.index! + m[0].indexOf("=") + 1;
    const local = tag.indexOf(raw, start);
    if (!result.has(m[1].toLowerCase())) result.set(m[1].toLowerCase(), { value: raw, offset: offset + local });
  }
  return result;
}

/** URL normalization is discovery only, never network authorization. */
export function referenceUrl(raw: string, base?: string): string | null {
  if (raw.length > L.urlChars) return null;
  try {
    const u = new URL(decodeEntities(raw), base);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    u.hash = "";
    return u.href.length <= L.urlChars ? u.href : null;
  } catch { return null; }
}
