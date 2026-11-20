import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseBrandEvidence, reviewPalette } from '../src/lib/campaign-lab/brand-review.ts';
import { resolveVisualDirection } from '../src/lib/campaign-lab/visual-directions.ts';
import { groupPaletteColors, filterPaletteColors, matchingPaletteObservations, paletteInspectionFor, resolvePaletteInspection, choosePaletteObservation } from '../src/lib/campaign-lab/palette-browser.ts';
const exactId='d99add5313115f0d416d72a34e938dcf83d1eb3af3310040f7cffaaa25324972';
const fixture=()=>parseBrandEvidence(readFileSync(new URL('./fixtures/palette-review/large.json',import.meta.url),'utf8'));
const setup=()=>{const draft=fixture();const group=groupPaletteColors(draft).find(g=>g.color==='#6b2340ff')!;return {draft,group,base:group.observations[0],dark:group.observations[2],conditional:group.observations[4]};};
const all={query:'',sourceId:'',opacity:'all'};

test('source-filter discovery and initial inspection share a match and keep every original member',()=>{
 const {group,dark}=setup(), filters={...all,sourceId:dark.source.id};
 assert.strictEqual(filterPaletteColors([group],filters.query,filters.sourceId,filters.opacity)[0],group);
 assert.equal(group.observations.length,6);assert.equal(matchingPaletteObservations(group,filters).length,2);
 const selected=resolvePaletteInspection(group,filters)!;
 assert.equal(selected.observation.candidate.id,exactId);assert.equal(selected.observation.source.id,dark.source.id);
 assert.equal(selected.outsideFilters,false);
});

test('exact candidate-ID search inspects that exact original ID, including case/whitespace normalization',()=>{
 const {group}=setup();
 for(const query of [exactId,`  ${exactId.toUpperCase()}  `]){
  const selected=resolvePaletteInspection(group,{...all,query})!;
  assert.equal(selected.observation.candidate.id,exactId);assert.equal(selected.matching.length,1);
 }
 // A quote can mention another ID; exact identity still wins over source order.
 const copy=structuredClone(group);copy.observations[0].candidate.evidence.quote=exactId;
 assert.equal(resolvePaletteInspection(copy,{...all,query:exactId})!.observation.candidate.id,exactId);
});

test('source and every query word must match the same observation, with opacity respected',()=>{
 const {group,base,dark}=setup();
 assert.equal(resolvePaletteInspection(group,{...all,query:'dark-theme #6b2340',sourceId:base.source.id}),undefined);
 assert.equal(resolvePaletteInspection(group,{...all,query:exactId,sourceId:base.source.id}),undefined);
 assert.equal(resolvePaletteInspection(group,{...all,query:'dark-theme #6b2340',sourceId:dark.source.id})!.observation.candidate.id,exactId);
 assert.equal(resolvePaletteInspection(group,{...all,opacity:'alpha'}),undefined);
});

test('changed filters reconcile an already open inspection; no-result and clear behavior are deterministic',()=>{
 const {group,base,dark,conditional}=setup();const old=paletteInspectionFor(base.candidate.id,all);
 const darkFilter={...all,sourceId:dark.source.id};
 assert.equal(resolvePaletteInspection(group,darkFilter,old)!.observation.candidate.id,dark.candidate.id);
 const other=group.observations[3].candidate.id;
 assert.equal(resolvePaletteInspection(group,{...all,query:other},old)!.observation.candidate.id,other);
 assert.equal(resolvePaletteInspection(group,{...all,sourceId:conditional.source.id},old)!.observation.candidate.id,conditional.candidate.id);
 assert.equal(resolvePaletteInspection(group,{...all,query:'no-match'},old),undefined);
 assert.equal(resolvePaletteInspection(group,all)!.observation.candidate.id,base.candidate.id);
});

test('deliberate outside-filter selection is retained and marked; Use preserves that exact source identity',()=>{
 const {draft,group,base,dark,conditional}=setup();const filters={...all,sourceId:dark.source.id};
 const explicit=paletteInspectionFor(base.candidate.id,filters);
 const inspected=resolvePaletteInspection(group,filters,explicit)!;assert.equal(inspected.outsideFilters,true);
 assert.equal(inspected.observation.candidate.id,base.candidate.id);assert.equal(inspected.matching.length,2);
 const selected=choosePaletteObservation({},'accent',inspected.observation.candidate);
 const snapshot=reviewPalette(draft,selected,resolveVisualDirection().tokens).snapshot!;
 assert.equal(snapshot.selections[0].candidateId,base.candidate.id);assert.equal(snapshot.selections[0].sourceId,base.source.id);
 assert.equal(resolvePaletteInspection(group,{...all,sourceId:conditional.source.id},explicit)!.outsideFilters,false);
 // Inspect selected explicitly clears filters but preserves the selected member.
 assert.equal(resolvePaletteInspection(group,all,paletteInspectionFor(dark.candidate.id,all))!.observation.candidate.id,dark.candidate.id);
});

test('filter/inspection changes leave pending corrections, accepted snapshot and original draft unchanged',()=>{
 const {draft,group,dark}=setup();const alpha=draft.candidates.find(c=>c.observed==='#12345680')!;
 const pending={accent:{candidateId:alpha.id,value:'#123456'}};
 const snapshot=reviewPalette(draft,pending,resolveVisualDirection().tokens).snapshot!;
 const before=JSON.stringify({draft,pending,snapshot});
 for(const filters of [all,{...all,sourceId:dark.source.id},{...all,query:exactId},{...all,query:'no-match'}]){
  filterPaletteColors([group],filters.query,filters.sourceId,filters.opacity);
  resolvePaletteInspection(group,filters,paletteInspectionFor(group.observations[0].candidate.id,all));
 }
 assert.equal(JSON.stringify({draft,pending,snapshot}),before);
 assert.equal(snapshot.selections[0].review,'corrected');assert.equal(snapshot.sourceBytesVerified,false);
});
