import type { BrandKitDraft, EvidenceCandidate, EvidenceSource } from './brand-import/evidence-types.ts';
import type { PaletteRole } from './brand-review.ts';

export type PaletteChoice = { candidateId: string; value: string };
export type PaletteChoices = Partial<Record<PaletteRole, PaletteChoice>>;
export type ColorObservation = { candidate: EvidenceCandidate; source: EvidenceSource };
export type ColorGroup = {
  key: string; color: string; label: string; category: 'ui-color' | 'raster-color';
  observations: ColorObservation[];
};

/** A coarse browsing name only, never a source/brand/role claim. */
export function colorName(rgba: string): string {
  const [r,g,b] = [1,3,5].map(i=>parseInt(rgba.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min, light=(max+min)/2;
  let name: string;
  if(delta<.07) name=light>.95 ? 'White' : light<.09 ? 'Black' : light>.7 ? 'Light gray' : light<.3 ? 'Dark gray' : 'Gray';
  else {
    const hue=((max===r ? (g-b)/delta : max===g ? (b-r)/delta+2 : (r-g)/delta+4)*60+360)%360;
    name=hue<15 || hue>=345 ? 'Red' : hue<45 ? 'Orange' : hue<70 ? 'Yellow' : hue<165 ? 'Green' : hue<195 ? 'Teal' : hue<260 ? 'Blue' : hue<290 ? 'Purple' : 'Pink';
    if(light>.85) name=`Light ${name.toLowerCase()}`;
    else if(light<.3) name=`Dark ${name.toLowerCase()}`;
  }
  return rgba.slice(7).toLowerCase()==='ff' ? name : `Translucent ${name.toLowerCase()}`;
}

/** First-seen order, exact RGBA/category equality only. Keep every identity. */
export function groupPaletteColors(draft: BrandKitDraft): ColorGroup[] {
  const groups=new Map<string,ColorGroup>();
  const sources=new Map(draft.sources.map(source=>[source.id,source]));
  for(const candidate of draft.candidates) {
    if(candidate.category!=='ui-color' && candidate.category!=='raster-color') continue;
    const color=candidate.observed.toLowerCase(), key=`${candidate.category}:${color}`;
    const group=groups.get(key) ?? {key,color,label:colorName(color),category:candidate.category,observations:[]};
    group.observations.push({candidate,source:sources.get(candidate.sourceId)!});
    groups.set(key,group);
  }
  return [...groups.values()];
}

export type PaletteFilters = { query: string; sourceId: string; opacity: string };
export type PaletteInspection = { candidateId: string; filtersKey: string };
const queryWords = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);
const filtersKey = (filters: PaletteFilters) => JSON.stringify([queryWords(filters.query),filters.sourceId,filters.opacity]);

/** Source and every query word must match one original observation. */
export function matchingPaletteObservations(group: ColorGroup, filters: PaletteFilters): ColorObservation[] {
  if(filters.opacity==='opaque' && !group.color.endsWith('ff') || filters.opacity==='alpha' && group.color.endsWith('ff')) return [];
  const words=queryWords(filters.query);
  return group.observations.filter(({candidate,source})=>{
      if(filters.sourceId && source.id!==filters.sourceId) return false;
      const text=[group.label,group.color,source.finalUrl,source.id,source.sha256,candidate.id,candidate.method,candidate.roleHint?.value,candidate.roleHint?.reason,candidate.evidence.quote,...candidate.uncertainty,...source.issues].join(' ').toLowerCase();
      return words.every(word=>text.includes(word));
  });
}

/** Filter groups, not their membership: hidden observations never disappear. */
export function filterPaletteColors(groups: ColorGroup[], query: string, sourceId: string, opacity: string): ColorGroup[] {
  return groups.filter(group=>matchingPaletteObservations(group,{query,sourceId,opacity}).length>0);
}

/** An explicit inspection belongs to these filters, never to later filter intent. */
export function paletteInspectionFor(candidateId: string, filters: PaletteFilters): PaletteInspection {
  return {candidateId,filtersKey:filtersKey(filters)};
}

/** Exact ID first, otherwise first matching observation in original source order.
 * An explicit member choice is retained only for the same filters and disclosed
 * if outside them. No role choices or accepted appearance are inputs/mutated. */
export function resolvePaletteInspection(group: ColorGroup, filters: PaletteFilters, selection?: PaletteInspection) {
  const matching=matchingPaletteObservations(group,filters);
  if(!matching.length) return undefined;
  const explicit=selection?.filtersKey===filtersKey(filters)
    ? group.observations.find(o=>o.candidate.id===selection.candidateId) : undefined;
  const observation=explicit ?? matching.find(o=>o.candidate.id===filters.query.trim().toLowerCase()) ?? matching[0];
  return {observation,matching,outsideFilters:!matching.includes(observation)};
}

export function choosePaletteObservation(choices: PaletteChoices, role: PaletteRole, candidate: EvidenceCandidate): PaletteChoices {
  return {...choices,[role]:{candidateId:candidate.id,value:candidate.observed.toLowerCase().endsWith('ff') ? candidate.observed.slice(0,7) : ''}};
}
