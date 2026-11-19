"use client";
import { useEffect, useId, useRef, useState } from "react";
import { PALETTE_ROLES, reviewPalette, type BrandKitSnapshot, type PaletteRole } from "@/lib/campaign-lab/brand-review";
import { BrandEvidenceSelection, type EvidenceSelectionResult } from "@/lib/campaign-lab/brand-url-client";
import type { BrandKitDraft } from "@/lib/campaign-lab/brand-import/evidence-types";
import { resolveVisualDirection } from "@/lib/campaign-lab/visual-directions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Choice = { candidateId: string; value: string };
export function BrandEvidenceReview({ snapshot, directionId, accentOverride, onApply }: { snapshot?: BrandKitSnapshot; directionId?: string; accentOverride?: string; onApply: (snapshot?: BrandKitSnapshot) => void }) {
  const id = useId();
  const reader = useRef(new BrandEvidenceSelection());
  const [websiteUrl,setWebsiteUrl] = useState("");
  const [draft,setDraft] = useState<BrandKitDraft | null>(null);
  const [choices,setChoices] = useState<Partial<Record<PaletteRole,Choice>>>({});
  const [importValid,setImportValid] = useState(false);
  const [pending,setPending] = useState(false);
  const [importError, setImportError] = useState("");
  const [notice,setNotice] = useState("");
  useEffect(() => { const r=reader.current; return () => r.cancel(); },[]);
  async function load(file?: File) {
    // Cancellation also invalidates any older read, but preserves the current gate/error.
    if (!file) {
      reader.current.cancel();
      setPending(false);
      return;
    }
    setPending(true);
    setImportValid(false);
    setImportError("");
    setNotice("");
    const result = await reader.current.file(file);
    finish(result);
  }
  function finish(result: EvidenceSelectionResult) {
    if (result.stale) return;
    setPending(false);
    if (result.error) setImportError(result.error);
    if (result.draft) {
      setImportValid(true);
      setDraft(result.draft);
      setChoices({});
      setNotice(result.notice ?? "Evidence loaded. Select roles, review contrast, then apply.");
    }
  }
  async function loadUrl() {
    setPending(true); setImportValid(false); setImportError(""); setNotice("");
    finish(await reader.current.url(websiteUrl));
  }
  function cancel() { reader.current.cancel(); setPending(false); }
  // Recompute from current inputs, including controls outside this panel.
  const validation = draft && importValid && !pending
    ? reviewPalette(draft, choices, resolveVisualDirection(directionId).tokens, accentOverride)
    : undefined;
  const error = importError || validation?.error;
  function apply() {
    if (!importValid || pending || importError || !validation?.snapshot) return;
    onApply(validation.snapshot);
    setNotice("Palette applied. Generate, inspect and approve a fresh preview before export.");
  }
  const colors=draft?.candidates.filter(c => c.category==="ui-color" || c.category==="raster-color") ?? [];
  return <details className="my-4 min-w-0 rounded-xl border border-[#c9bda8] bg-[#fffdf8] p-4" data-brand-review>
    <summary className="min-h-8 cursor-pointer font-semibold">Brand evidence (optional){snapshot ? " · palette applied" : ""}</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>Review colors only. This does not confirm ownership, campaign facts or media rights.</p>
      <Label htmlFor={`${id}-url`}>Website URL</Label>
      <div className="flex flex-wrap gap-2">
        <Input id={`${id}-url`} type="url" className="min-w-0 flex-1 basis-48" maxLength={2048} placeholder="https://brand.example" value={websiteUrl} onChange={e=>{cancel();setImportValid(false);setImportError("");setNotice("");setWebsiteUrl(e.target.value);}} />
        <Button type="button" disabled={pending || !websiteUrl} onClick={()=>void loadUrl()}>Read website colors</Button>
        {pending ? <Button type="button" variant="secondary" onClick={cancel}>Cancel read</Button> : null}
      </div>
      <Label htmlFor={`${id}-file`}>Brand evidence JSON</Label>
      <Input id={`${id}-file`} type="file" accept=".json,application/json" onChange={e => { const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; void load(file); }} />
      {pending ? <p role="status">Reading evidence…</p> : null}
      {error ? <p role="alert" className="break-words text-[#a2382a]">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {snapshot ? <div><p>Applied: {snapshot.selections.map(v => `${v.role} ${v.value} (${v.review})`).join(" · ")}</p><Button type="button" variant="secondary" onClick={() => { onApply(undefined); setNotice("Reviewed palette removed. Generate and approve again."); }}>Remove reviewed palette</Button></div> : null}
      {accentOverride ? <p>Operator accent override {accentOverride} wins. Clear the accent override to expose the reviewed accent.</p> : null}
      {draft ? <>
        <p>{draft.outcome} · {draft.sources.length} sources · {colors.filter(c=>c.category==="ui-color").length} UI colors · {colors.filter(c=>c.category==="raster-color").length} photograph/sample colors</p>
        <details><summary>Evidence warnings and sources</summary><p>Source hashes are imported claims; original website bytes are unverified.</p><ul className="space-y-2 break-words">{draft.gaps.map((g,i)=><li key={i}>{g}</li>)}{draft.sources.map(s=><li key={s.id}>{s.kind} · {s.outcome} · {s.finalUrl}<br/>Claimed SHA-256: {s.sha256}<br/>{s.issues.join(" · ")}</li>)}</ul></details>
        {!colors.length ? <p>No supported color evidence. Keep the direction defaults or use the manual accent override. No kit has been invented.</p> : PALETTE_ROLES.map(role => {
          const choice=choices[role]; const c=colors.find(c=>c.id===choice?.candidateId);
          return <fieldset key={role} className="min-w-0 space-y-2 border-t border-[#ddd3c2] pt-3"><legend className="font-semibold capitalize">{role}</legend>
            <Label htmlFor={`${id}-${role}-candidate`}>{role} evidence</Label>
            <select id={`${id}-${role}-candidate`} className="min-h-11 w-full max-w-full rounded border p-2" value={choice?.candidateId ?? ""} onChange={e => {
              const candidate = colors.find(candidate => candidate.id === e.target.value);
              setChoices(previous => ({ ...previous, [role]: {
                candidateId: candidate?.id ?? "",
                value: candidate?.observed.endsWith("ff") ? candidate.observed.slice(0,7) : "",
              } }));
            }}>
              <option value="">Keep direction default</option>
              <optgroup label="UI colors">{colors.filter(c=>c.category==="ui-color").map((c,i)=><option key={c.id} value={c.id}>{i+1}. {c.observed} · {c.roleHint?.value} · {c.method}</option>)}</optgroup>
              <optgroup label="Photograph/sample colors — not UI identity">{colors.filter(c=>c.category==="raster-color").map((c,i)=><option key={c.id} value={c.id}>{i+1}. {c.observed} · image sample</option>)}</optgroup>
            </select>
            {c ? <div className="space-y-2 break-words">
              <span className="inline-block size-8 border border-black" style={{backgroundColor:c.observed}} aria-label={`Observed ${c.observed}`}/>
              <p>Source: {draft.sources.find(s=>s.id===c.sourceId)?.finalUrl} · {c.category === "ui-color" ? "UI color" : "Photograph sample — not UI identity"}</p>
              <Label htmlFor={`${id}-${role}-value`}>{role} opaque value / correction</Label>
              <Input id={`${id}-${role}-value`} value={choice?.value ?? ""} placeholder="#123456" onChange={e => {
                setChoices(previous => ({ ...previous, [role]: { candidateId: c.id, value: e.target.value } }));
              }} />
              {!c.observed.endsWith("ff") ? <p>Alpha evidence retained. Enter an explicit opaque correction; no background is inferred.</p> : null}
              <details>
                <summary>Color evidence details</summary>
                <p>{c.method} · {c.roleHint?.value} · {c.confidence.level} confidence: {c.confidence.reason}</p>
                <p>{c.uncertainty.join(" ")}</p>
                <p>Claimed SHA-256: {c.sourceSha256}</p>
                <blockquote className="border-l-2 pl-2">{c.evidence.quote}</blockquote>
              </details>
            </div> : null}
          </fieldset>;
        })}
        <p>Ink/muted text on page, offer tint, accent text, action text and keyboard focus must remain readable. Unselected roles use direction defaults.</p>
        <Button type="button" disabled={!importValid || pending || Boolean(importError) || !validation?.snapshot} onClick={apply}>Apply reviewed palette</Button>
      </> : null}
    </div>
  </details>;
}
