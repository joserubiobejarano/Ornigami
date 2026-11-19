"use client";
import { useEffect, useId, useRef, useState } from "react";
import { BrandEvidenceFileReader, PALETTE_ROLES, parseBrandSnapshot, paletteTokens, type BrandKitSnapshot, type PaletteRole } from "@/lib/campaign-lab/brand-review";
import type { BrandKitDraft } from "@/lib/campaign-lab/brand-import/evidence-types";
import { resolveVisualDirection } from "@/lib/campaign-lab/visual-directions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Choice = { candidateId: string; value: string };
export function BrandEvidenceReview({ snapshot, directionId, accentOverride, onApply }: { snapshot?: BrandKitSnapshot; directionId?: string; accentOverride?: string; onApply: (snapshot?: BrandKitSnapshot) => void }) {
  const id = useId();
  const reader = useRef(new BrandEvidenceFileReader());
  const [draft,setDraft] = useState<BrandKitDraft | null>(null);
  const [choices,setChoices] = useState<Partial<Record<PaletteRole,Choice>>>({});
  const [importValid,setImportValid] = useState(false);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  useEffect(() => { const r=reader.current; return () => r.cancel(); },[]);
  async function load(file?: File) {
    setPending(Boolean(file)); setError("");
    if (file) { setImportValid(false); setNotice(""); }
    const result=await reader.current.read(file);
    if (result.stale) return;
    setPending(false);
    if (result.error) setError(result.error);
    if (result.draft) { setImportValid(true); setDraft(result.draft); setChoices({}); setNotice("Evidence loaded. Select roles, review contrast, then apply."); }
  }
  function apply() {
    if (!draft || !importValid || pending || error) return;
    try {
      const selections=PALETTE_ROLES.flatMap(role => {
        const choice=choices[role]; if (!choice?.candidateId) return [];
        const c=draft.candidates.find(c => c.id===choice.candidateId)!;
        return [{ role, value:choice.value, candidateId:c.id, originalValue:c.observed, sourceId:c.sourceId, sourceSha256:c.sourceSha256, method:c.method, category:c.category, review: c.observed.toLowerCase()===`${choice.value.toLowerCase()}ff` ? "selected" : "corrected" }];
      });
      const next=parseBrandSnapshot({ schemaVersion:"ornigami-brand-snapshot/1.0.0", draftSchemaVersion:draft.schemaVersion, extractorVersion:draft.extractorVersion, provenance:"imported-claims-unverified", reviewMethod:"local-operator-palette", selections, ownerConfirmed:false, campaignFactsApproved:false, mediaRightsApproved:false, sourceBytesVerified:false });
      paletteTokens(resolveVisualDirection(directionId).tokens,next,accentOverride);
      onApply(next); setNotice("Palette applied. Generate, inspect and approve a fresh preview before export.");
    } catch (e) { setNotice(""); setError((e as Error).message.startsWith("[") ? "Select a role and use opaque six-digit hex corrections. Translucency cannot be applied." : (e as Error).message); }
  }
  const colors=draft?.candidates.filter(c => c.category==="ui-color" || c.category==="raster-color") ?? [];
  return <details className="my-4 min-w-0 rounded-xl border border-[#c9bda8] bg-[#fffdf8] p-4" data-brand-review>
    <summary className="min-h-8 cursor-pointer font-semibold">Brand evidence JSON (optional){snapshot ? " · palette applied" : ""}</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>Saved evidence suggests colors. It confirms neither brand ownership, campaign facts nor media rights. Source hashes are imported claims; original website bytes are unverified.</p>
      <Label htmlFor={`${id}-file`}>Brand evidence JSON</Label>
      <Input id={`${id}-file`} type="file" accept=".json,application/json" onChange={e => { const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; void load(file); }} />
      {pending ? <p role="status">Reading evidence…</p> : null}
      {error ? <p role="alert" className="break-words text-[#a2382a]">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {snapshot ? <div><p>Applied: {snapshot.selections.map(v => `${v.role} ${v.value} (${v.review})`).join(" · ")}</p><Button type="button" variant="secondary" onClick={() => { onApply(undefined); setNotice("Reviewed palette removed. Generate and approve again."); }}>Remove reviewed palette</Button></div> : null}
      {accentOverride ? <p>Operator accent override {accentOverride} wins. Clear the accent override to expose the reviewed accent.</p> : null}
      {draft ? <>
        <p>{draft.outcome} · {draft.sources.length} sources · {colors.filter(c=>c.category==="ui-color").length} UI colors · {colors.filter(c=>c.category==="raster-color").length} photograph/sample colors</p>
        <details><summary>Evidence warnings and sources</summary><ul className="space-y-2 break-words">{draft.gaps.map((g,i)=><li key={i}>{g}</li>)}{draft.sources.map(s=><li key={s.id}>{s.kind} · {s.outcome} · {s.finalUrl}<br/>Claimed SHA-256: {s.sha256}<br/>{s.issues.join(" · ")}</li>)}</ul></details>
        {!colors.length ? <p>No supported color evidence. Keep the direction defaults or use the manual accent override. No kit has been invented.</p> : PALETTE_ROLES.map(role => {
          const choice=choices[role]; const c=colors.find(c=>c.id===choice?.candidateId);
          return <fieldset key={role} className="min-w-0 space-y-2 border-t border-[#ddd3c2] pt-3"><legend className="font-semibold capitalize">{role}</legend>
            <Label htmlFor={`${id}-${role}-candidate`}>{role} evidence</Label>
            <select id={`${id}-${role}-candidate`} className="min-h-11 w-full max-w-full rounded border p-2" value={choice?.candidateId ?? ""} onChange={e => { const c=colors.find(c=>c.id===e.target.value); setChoices(v=>({...v,[role]:{candidateId:c?.id ?? "",value:c?.observed.endsWith("ff") ? c.observed.slice(0,7) : ""}})); setError(""); }}>
              <option value="">Keep direction default</option>
              <optgroup label="UI colors">{colors.filter(c=>c.category==="ui-color").map((c,i)=><option key={c.id} value={c.id}>{i+1}. {c.observed} · {c.roleHint?.value} · {c.method}</option>)}</optgroup>
              <optgroup label="Photograph/sample colors — not UI identity">{colors.filter(c=>c.category==="raster-color").map((c,i)=><option key={c.id} value={c.id}>{i+1}. {c.observed} · image sample</option>)}</optgroup>
            </select>
            {c ? <div className="space-y-2 break-words"><span className="inline-block size-8 border border-black" style={{backgroundColor:c.observed}} aria-label={`Observed ${c.observed}`}/><p>{c.method} · {c.roleHint?.value} · {c.confidence.level} confidence: {c.confidence.reason}</p><p>{c.uncertainty.join(" ")}</p><p>Source: {draft.sources.find(s=>s.id===c.sourceId)?.finalUrl} · {c.sourceSha256}</p><blockquote className="border-l-2 pl-2">{c.evidence.quote}</blockquote>
              <Label htmlFor={`${id}-${role}-value`}>{role} opaque value / correction</Label><Input id={`${id}-${role}-value`} value={choice?.value ?? ""} placeholder="#123456" onChange={e=>{setChoices(v=>({...v,[role]:{candidateId:c.id,value:e.target.value}}));setError("");}} />
              {!c.observed.endsWith("ff") ? <p>Alpha evidence retained. Enter an explicit opaque correction; no background is inferred.</p> : null}
            </div> : null}
          </fieldset>;
        })}
        <p>Ink/muted text on page, offer tint, accent text, action text and keyboard focus must remain readable. Unselected roles use direction defaults.</p>
        <Button type="button" disabled={!importValid || pending || Boolean(error) || !colors.length || !Object.values(choices).some(v=>v?.candidateId)} onClick={apply}>Apply reviewed palette</Button>
      </> : null}
    </div>
  </details>;
}
