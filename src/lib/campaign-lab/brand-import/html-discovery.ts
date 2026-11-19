import { activeHtml, attributes, decodeEntities, referenceUrl } from "./html-lexical.ts";

export type Discovery = { kind: "css" | "raster"; url: string };
/** Lexical subset, bounded tag enumeration including duplicate/irrelevant tags. */
export function discoverHtmlResources(html: string, base: string, maxTags: number) {
  const resources: Discovery[] = [];
  const issues = new Set<string>();
  const seen = new Set<string>([base]);
  let tags = 0;
  const active = activeHtml(html).replace(/<(style|title|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, s => " ".repeat(s.length));
  for (const m of active.matchAll(/<([a-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    if (tags >= maxTags) { issues.add("DISCOVERY_LIMIT"); break; }
    tags++;
    const tag = m[1].toLowerCase();
    const a = attributes(m[0], m.index!);
    const value = (name: string) => decodeEntities(a.get(name)?.value ?? "");
    if (tag === "base") issues.add("BASE_IGNORED");
    if (a.has("srcset")) issues.add("SRCSET_IGNORED");
    const rel = value("rel").toLowerCase().split(/\s+/);
    let kind: Discovery["kind"] | undefined;
    let raw = "";
    if (tag === "link" && rel.includes("stylesheet")) { kind = "css"; raw = a.get("href")?.value ?? ""; }
    else if (tag === "link" && rel.includes("icon")) { kind = "raster"; raw = a.get("href")?.value ?? ""; }
    else if (tag === "img") { kind = "raster"; raw = a.get("src")?.value ?? ""; }
    else if (tag === "meta" && ["og:image", "og:image:url"].includes(value("property").toLowerCase())) {
      kind = "raster"; raw = a.get("content")?.value ?? "";
    }
    if (!kind || !raw) continue;
    const url = referenceUrl(raw, base);
    if (!url) { issues.add("INVALID_REFERENCE"); continue; }
    if (seen.has(url)) { issues.add("DUPLICATE_REFERENCE"); continue; }
    seen.add(url);
    resources.push({ kind, url });
  }
  return { resources, issues: [...issues], tags };
}
