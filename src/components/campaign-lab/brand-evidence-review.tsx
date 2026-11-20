"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PALETTE_ROLES, reviewPalette, type BrandKitSnapshot, type PaletteRole } from "@/lib/campaign-lab/brand-review";
import { choosePaletteObservation, filterPaletteColors, groupPaletteColors, paletteInspectionFor, resolvePaletteInspection, type PaletteChoices, type PaletteInspection } from "@/lib/campaign-lab/palette-browser";
import { BrandEvidenceSelection, type EvidenceSelectionResult } from "@/lib/campaign-lab/brand-url-client";
import type { BrandKitDraft } from "@/lib/campaign-lab/brand-import/evidence-types";
import { resolveVisualDirection } from "@/lib/campaign-lab/visual-directions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const control = "min-h-11 rounded border border-[#b2aa9b] bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171813] disabled:opacity-50";
const PAGE_SIZE = 12;
const sourceName = (url: string) => { const u=new URL(url); return `${u.hostname}${u.pathname}`; };
const displayColor = (color: string) => color.endsWith('ff') ? color.slice(0,7) : color;

export function BrandEvidenceReview({ snapshot, directionId, accentOverride, onApply }: { snapshot?: BrandKitSnapshot; directionId?: string; accentOverride?: string; onApply: (snapshot?: BrandKitSnapshot) => void }) {
  const id = useId();
  const reader = useRef(new BrandEvidenceSelection());
  const [websiteUrl,setWebsiteUrl] = useState("");
  const [draft,setDraft] = useState<BrandKitDraft | null>(null);
  const [choices,setChoices] = useState<PaletteChoices>({});
  const [role,setRole] = useState<PaletteRole>('accent');
  const [pending,setPending] = useState(false);
  const [importError,setImportError] = useState("");
  const [notice,setNotice] = useState("");
  const [loaderOpen,setLoaderOpen] = useState(true);
  const [query,setQuery] = useState("");
  const [sourceId,setSourceId] = useState("");
  const [opacity,setOpacity] = useState("all");
  const [category,setCategory] = useState<'ui-color'|'raster-color'>('ui-color');
  const [page,setPage] = useState(0);
  const [inspectKey,setInspectKey] = useState("");
  const [inspection,setInspection] = useState<PaletteInspection>();
  const [focusKey,setFocusKey] = useState("");
  const [correctionOpen,setCorrectionOpen] = useState(false);
  const firstRole = useRef<HTMLButtonElement>(null);
  useEffect(() => { const r=reader.current; return () => r.cancel(); },[]);
  useEffect(() => { if(draft) firstRole.current?.focus(); },[draft]);
  function clearFilters() { setQuery('');setSourceId('');setOpacity('all');setPage(0); }
  function finish(result: EvidenceSelectionResult) {
    if(result.stale) return;
    setPending(false);
    if(result.error) { setImportError(result.error);setNotice("Previous evidence and pending selections are kept."); }
    if(result.draft) {
      setDraft(result.draft);setChoices({});setInspectKey('');setInspection(undefined);
      clearFilters();setCategory('ui-color');setRole('accent');setLoaderOpen(false);setCorrectionOpen(false);
      setNotice(result.notice ?? "Saved evidence loaded.");
    }
  }
  async function load(file?: File) {
    if(!file) { reader.current.cancel();setPending(false);return; }
    setPending(true);setImportError('');setNotice('');
    finish(await reader.current.file(file));
  }
  async function loadUrl() {
    setPending(true);setImportError('');setNotice('');
    finish(await reader.current.url(websiteUrl));
  }
  function cancel() { reader.current.cancel();setPending(false); }
  const defaults=resolveVisualDirection(directionId).tokens;
  // Always recompute for external direction/override edits and failed replacements.
  const validation=draft && !pending ? reviewPalette(draft,choices,defaults,accentOverride) : undefined;
  const groups=useMemo(()=>draft ? groupPaletteColors(draft) : [],[draft]);
  const visible=filterPaletteColors(groups.filter(g=>g.category===category),query,sourceId,opacity);
  const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE)), currentPage=Math.min(page,pages-1);
  const shown=visible.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
  const inspecting=visible.find(g=>g.key===inspectKey);
  const filters={query,sourceId,opacity};
  const resolvedInspection=inspecting ? resolvePaletteInspection(inspecting,filters,inspection) : undefined;
  const observation=resolvedInspection?.observation;
  const activeChoice=choices[role], activeCandidate=draft?.candidates.find(c=>c.id===activeChoice?.candidateId);
  function inspectSelected() {
    const group=groups.find(g=>g.observations.some(o=>o.candidate.id===activeChoice?.candidateId));
    if(!group) return;
    clearFilters();setCategory(group.category);setInspectKey(group.key);
    setInspection(paletteInspectionFor(activeChoice!.candidateId,{query:'',sourceId:'',opacity:'all'}));
    setPage(Math.floor(groups.filter(g=>g.category===group.category).indexOf(group)/PAGE_SIZE));
  }
  function apply() {
    if(pending || !validation?.snapshot) return;
    onApply(validation.snapshot);
    setNotice("Palette applied. Generate, inspect and approve a fresh preview before export.");
  }
  return <details className="my-4 min-w-0 rounded-xl border border-[#c9bda8] bg-[#fffdf8] p-4" data-brand-review>
    <summary className="min-h-8 cursor-pointer font-semibold">Brand evidence (optional){snapshot ? " · palette applied" : ""}</summary>
    <div className="mt-3 space-y-4 text-sm">
      <p>Review colors only. This does not confirm ownership, campaign facts or media rights.</p>
      <details open={loaderOpen} onToggle={e=>setLoaderOpen(e.currentTarget.open)}>
        <summary className="min-h-8 cursor-pointer font-medium">Load or replace evidence</summary>
        <div className="space-y-2 pt-2">
          <Label htmlFor={`${id}-url`}>Website URL</Label>
          <div className="flex flex-wrap gap-2">
            <Input id={`${id}-url`} type="url" className="min-w-0 flex-1 basis-48" maxLength={2048} placeholder="https://brand.example" value={websiteUrl} onChange={e=>{cancel();setImportError('');setWebsiteUrl(e.target.value);setNotice('URL edited. Current evidence is kept until a successful read.');}} />
            <Button type="button" disabled={pending || !websiteUrl} onClick={()=>void loadUrl()}>Read website colors</Button>
            {pending ? <Button type="button" variant="secondary" onClick={cancel}>Cancel read</Button> : null}
          </div>
          <Label htmlFor={`${id}-file`}>Brand evidence JSON</Label>
          <Input id={`${id}-file`} type="file" accept=".json,application/json" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void load(file);}} />
        </div>
      </details>
      {pending ? <p role="status">Reading evidence… Current work is kept.</p> : null}
      {importError ? <p role="alert" className="break-words text-[#a2382a]">{importError}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {snapshot ? <div className="space-y-1"><p>Applied: {snapshot.selections.map(v=>`${v.role} ${v.value}`).join(' · ')}</p><button type="button" className={control} onClick={()=>{onApply(undefined);setNotice('Reviewed palette removed. Generate and approve again.');}}>Remove reviewed palette</button></div> : null}
      {draft ? <>
        <div role="group" aria-label="Pending palette" className="grid grid-cols-3 gap-2">
          {PALETTE_ROLES.map(r=>{
            const choice=choices[r], candidate=draft.candidates.find(c=>c.id===choice?.candidateId);
            const value=choice ? (/^#[\da-f]{6}$/i.test(choice.value) ? choice.value : candidate?.observed) : defaults[r];
            const effective=r==='accent' && accentOverride ? accentOverride : value;
            return <button type="button" key={r} ref={r==='accent' ? firstRole : undefined} aria-label={`Choose color for ${r}`} aria-pressed={role===r} onClick={()=>setRole(r)} className={`${control} min-w-0 space-y-1 px-2 text-left ${role===r ? 'ring-2 ring-[#171813]' : ''}`}>
              <span aria-hidden="true" className="block h-8 rounded border border-black/25" style={{backgroundColor:effective}} />
              <span className="block font-semibold capitalize">{r}</span>
              <span className="block break-all text-xs">{effective || 'Needs correction'}</span>
              <span className="block text-xs">{r==='accent' && accentOverride ? 'Override' : choice ? 'Pending' : 'Direction default'}</span>
            </button>;
          })}
        </div>
        {accentOverride ? <p>Accent override {accentOverride} wins over the reviewed accent. Clear it outside this panel to expose the selection.</p> : null}
        {activeCandidate ? <details open={correctionOpen} onToggle={e=>setCorrectionOpen(e.currentTarget.open)} className="space-y-2 rounded border border-[#ddd3c2] p-3" aria-label={`${role} pending selection`}>
          <summary className="min-h-8 cursor-pointer font-medium">Correct / inspect selected {role}</summary>
          <p>Observed: {displayColor(activeCandidate.observed.toLowerCase())}</p>
            <Label htmlFor={`${id}-correction`}>{role} opaque value / correction</Label>
            <Input id={`${id}-correction`} value={activeChoice?.value ?? ''} placeholder="#123456" onChange={e=>setChoices(previous=>({...previous,[role]:{candidateId:activeCandidate.id,value:e.target.value}}))} />
            {!activeCandidate.observed.toLowerCase().endsWith('ff') ? <p>Translucent observation. Enter an opaque correction; no background is inferred.</p> : null}
            <div className="flex flex-wrap gap-2"><button type="button" className={control} onClick={inspectSelected}>Inspect selected observation</button><button type="button" className={control} onClick={()=>setChoices(previous=>({...previous,[role]:undefined}))}>Keep direction default for {role}</button></div>
        </details> : null}
        {validation?.error ? <p role="alert" className="break-words text-[#a2382a]">{validation.error}</p> : null}
        <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={pending || !validation?.snapshot} onClick={apply}>Apply reviewed palette</Button><span>Pending selections change the campaign only when applied.</span></div>
        {!groups.length ? <p>No supported color evidence. Keep direction defaults or the manual accent override. No kit has been invented.</p> : <>
          <div role="group" aria-label="Color evidence type" className="flex flex-wrap gap-2"><button type="button" className={control} aria-pressed={category==='ui-color'} onClick={()=>{setCategory('ui-color');setPage(0);}}>UI colors ({groups.filter(g=>g.category==='ui-color').length})</button><button type="button" className={control} aria-pressed={category==='raster-color'} onClick={()=>{setCategory('raster-color');setPage(0);}}>Photo samples ({groups.filter(g=>g.category==='raster-color').length})</button></div>
          {category==='raster-color' ? <p>Photograph samples are not UI identity. Selecting one is an explicit operator choice.</p> : null}
          <div className="space-y-2">
            <Label htmlFor={`${id}-search`}>Search colors or sources</Label><div className="flex gap-2"><Input id={`${id}-search`} className="min-w-0 flex-1" type="search" value={query} placeholder="Pink, gray, hex or source" onChange={e=>{setQuery(e.target.value);setPage(0);}} /><button type="button" className={control} onClick={clearFilters}>Clear filters</button></div>
            <details><summary className="min-h-8 cursor-pointer">Source and opacity filters</summary><div className="flex flex-wrap gap-2">
              <Label className="sr-only" htmlFor={`${id}-source`}>Filter source</Label><select id={`${id}-source`} className={`${control} min-w-0 max-w-full flex-1`} value={sourceId} onChange={e=>{setSourceId(e.target.value);setPage(0);}}><option value="">All sources</option>{draft.sources.map(s=><option key={s.id} value={s.id}>{sourceName(s.finalUrl)}</option>)}</select>
              <Label className="sr-only" htmlFor={`${id}-opacity`}>Filter opacity</Label><select id={`${id}-opacity`} className={`${control} max-w-full`} value={opacity} onChange={e=>{setOpacity(e.target.value);setPage(0);}}><option value="all">Any opacity</option><option value="opaque">Opaque</option><option value="alpha">Translucent</option></select>
            </div></details>
          </div>
          <p role="status">{visible.length ? `${currentPage*PAGE_SIZE+1}–${Math.min((currentPage+1)*PAGE_SIZE,visible.length)} of ${visible.length} colors` : 'No colors match. Clear filters or try another search.'} · {groups.filter(g=>g.category===category).reduce((n,g)=>n+g.observations.length,0)} observations</p>
          <p id={`${id}-keys`} className="text-xs">Tab to colors; arrows browse, Home/End jump, Enter inspects.</p>
          <ul aria-label="Color swatches" aria-describedby={`${id}-keys`} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" onKeyDown={e=>{
            const buttons=Array.from(e.currentTarget.querySelectorAll('button'));
            const index=buttons.indexOf(e.target as HTMLButtonElement);
            if(index<0) return;
            const columns=getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length;
            const target=e.key==='Home' ? 0 : e.key==='End' ? buttons.length-1 : e.key==='ArrowRight' ? index+1 : e.key==='ArrowLeft' ? index-1 : e.key==='ArrowDown' ? index+columns : e.key==='ArrowUp' ? index-columns : undefined;
            if(target===undefined) return;
            e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,target))]?.focus();
          }}>
            {shown.map(group=><li key={group.key} className="min-w-0"><button type="button" tabIndex={group.key===(shown.some(g=>g.key===focusKey) ? focusKey : shown[0]?.key) ? 0 : -1} onFocus={()=>setFocusKey(group.key)} aria-label={`Browse ${group.label} ${displayColor(group.color)}, ${group.observations.length} observations`} aria-pressed={inspectKey===group.key} className={`${control} w-full min-w-0 space-y-1 px-2 text-left ${inspectKey===group.key ? 'ring-2 ring-[#171813]' : ''}`} onClick={()=>{setInspectKey(group.key);setInspection(undefined);}}>
              <span aria-hidden="true" className="block h-9 rounded border border-black/25" style={{backgroundColor:group.color}} /><span className="block text-xs">{group.label}</span><span className="block break-all text-xs">{displayColor(group.color)}</span><span className="block text-xs">{group.observations.length} observations</span>
            </button></li>)}
          </ul>
          {pages>1 ? <div className="flex items-center justify-between gap-2" aria-label="Color pages"><button type="button" className={control} disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous colors</button><span>{currentPage+1} / {pages}</span><button type="button" className={control} disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}>Next colors</button></div> : null}
          {inspecting && observation ? <section className="space-y-3 rounded border border-[#b2aa9b] bg-white p-3" aria-label="Color observation">
            <p className="font-semibold">{inspecting.label} · {displayColor(inspecting.color)}</p><Label htmlFor={`${id}-observation`}>Observation ({inspecting.observations.length} total)</Label>
            <select id={`${id}-observation`} className={`${control} w-full min-w-0 max-w-full`} value={observation.candidate.id} onChange={e=>setInspection(paletteInspectionFor(e.target.value,filters))}>{inspecting.observations.map((o,i)=><option key={o.candidate.id} value={o.candidate.id}>{i+1}. {sourceName(o.source.finalUrl)} · {o.candidate.confidence.level} confidence{!resolvedInspection?.matching.includes(o) ? ' · outside filters' : ''}</option>)}</select>
            {resolvedInspection?.outsideFilters ? <p role="status">Outside current filters. Use will explicitly select this observation from {sourceName(observation.source.finalUrl)}.</p> : null}
            <p className="break-words">{sourceName(observation.source.finalUrl)} · {observation.candidate.category==='ui-color' ? 'UI observation' : 'Photo sample'}</p><p>{observation.candidate.uncertainty.join(' ')}</p>
            <button type="button" className={control} onClick={()=>{setChoices(previous=>choosePaletteObservation(previous,role,observation.candidate));setCorrectionOpen(!observation.candidate.observed.toLowerCase().endsWith('ff'));setNotice(`Selected ${displayColor(inspecting.color)} for ${role}. Apply after review.`);}}>Use {resolvedInspection?.outsideFilters ? 'outside-filter ' : ''}{displayColor(inspecting.color)} for {role}</button>
            <details className="break-words"><summary className="min-h-8 cursor-pointer">Observation provenance</summary><p>{observation.candidate.method} · {observation.candidate.confidence.level}: {observation.candidate.confidence.reason}</p><p>Context hint: {observation.candidate.roleHint?.value ?? 'unresolved'}. {observation.candidate.roleHint?.reason}</p><blockquote className="border-l-2 pl-2">{observation.candidate.evidence.quote}</blockquote><p>Candidate ID: {observation.candidate.id}</p><p>Source ID: {observation.candidate.sourceId}</p><p>Claimed SHA-256: {observation.candidate.sourceSha256}</p><p>Offset: {observation.candidate.evidence.utf16Offset ?? 'not applicable'} · review: {observation.candidate.reviewStatus}</p><dl>{Object.entries(observation.candidate.details).map(([key,value])=><div key={key}><dt className="inline">{key}: </dt><dd className="inline">{String(value)}</dd></div>)}</dl><p>{observation.source.issues.join(' · ')}</p></details>
          </section> : null}
        </>}
        <details className="break-words"><summary className="min-h-8 cursor-pointer">Evidence warnings and sources</summary><p>Exact RGBA duplicates are grouped separately for UI and photo evidence, in source order. Color names are browsing aids. Counts do not prove brand roles; no computed styles or ownership are inferred. All original observations remain available.</p><ul className="space-y-2">{draft.gaps.map((gap,i)=><li key={i}>{gap}</li>)}{draft.sources.map(s=><li key={s.id}>{s.kind} · {s.outcome} · {s.finalUrl}<br/>{s.requestedUrl!==s.finalUrl ? <>Requested: {s.requestedUrl}<br/></> : null}Source ID: {s.id}<br/>Claimed SHA-256: {s.sha256}<br/>{s.status} · {s.contentType} · {s.byteLength} declared bytes<br/>{s.issues.join(' · ')}</li>)}</ul></details>
      </> : null}
    </div>
  </details>;
}
