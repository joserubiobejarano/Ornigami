#!/usr/bin/env node
/**
 * Helpers for the SRI audit's script-set history.
 *
 * An audit records every script[src] URL, the declared integrity value and the
 * SHA-256 actually observed for same-origin assets. Sequential audits identify
 * scripts inserted by an ordinary interaction and scripts that were present
 * earlier but later removed. A removed script keeps its last observed URL and
 * hash in the run registry so it remains auditable.
 */

export function scriptKey(entry) {
  return String(entry?.src ?? "");
}

export function diffScriptAudits(previous, current) {
  const scriptList = (audit) => audit?.scriptRecords ?? audit?.scripts ?? [];
  const before = new Map(scriptList(previous).map((entry) => [scriptKey(entry), entry]));
  const after = new Map(scriptList(current).map((entry) => [scriptKey(entry), entry]));
  const inserted = scriptList(current).filter((entry) => !before.has(scriptKey(entry)));
  const removed = scriptList(previous).filter((entry) => !after.has(scriptKey(entry)));
  return {
    inserted,
    removed,
    unchanged: scriptList(current).filter((entry) => before.has(scriptKey(entry))),
  };
}

export function updateScriptRegistry(registry, audit) {
  const scriptList = audit?.scriptRecords ?? audit?.scripts ?? [];
  const byUrl = new Map((registry ?? []).map((entry) => [entry.src, entry]));
  const currentUrls = new Set(scriptList.map(scriptKey));
  for (const script of scriptList) {
    const existing = byUrl.get(script.src);
    if (existing) {
      existing.lastSeen = audit.label;
      existing.lastSeenAt = audit.completedAt;
      existing.lastIntegrity = script.integrity;
      existing.lastSha256 = script.sha256;
      existing.verified = existing.verified || script.verified;
    } else {
      byUrl.set(script.src, {
        src: script.src,
        path: script.path,
        firstSeen: audit.label,
        firstSeenAt: audit.completedAt,
        lastSeen: audit.label,
        lastSeenAt: audit.completedAt,
        lastIntegrity: script.integrity,
        lastSha256: script.sha256,
        verified: script.verified,
        presentAtLastAudit: true,
      });
    }
  }
  for (const entry of byUrl.values()) {
    entry.presentAtLastAudit = currentUrls.has(entry.src);
    if (!entry.presentAtLastAudit && !entry.removedAt) entry.removedAt = audit.label;
  }
  return [...byUrl.values()];
}
