import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { groupPaletteColors, filterPaletteColors, choosePaletteObservation, colorName } from '../src/lib/campaign-lab/palette-browser.ts';
import { parseBrandEvidence, reviewPalette, paletteTokens } from '../src/lib/campaign-lab/brand-review.ts';
import { resolveVisualDirection } from '../src/lib/campaign-lab/visual-directions.ts';
const fixture=(name:string)=>parseBrandEvidence(readFileSync(new URL(`./fixtures/palette-review/${name}.json`,import.meta.url),'utf8'));
const freeze=(value:object)=>{Object.freeze(value);for(const child of Object.values(value))if(child && typeof child==='object')freeze(child);};

test('large synthetic fixture groups exact RGBA/category only, without losing any identity or mutating evidence',()=>{
 const draft=fixture('large'), original=JSON.stringify(draft);freeze(draft);
 const groups=groupPaletteColors(draft), colors=draft.candidates.filter(c=>['ui-color','raster-color'].includes(c.category));
 assert(colors.length>=109);assert.equal(colors.length,128);
 const members=groups.flatMap(g=>g.observations);
 assert.equal(members.length,colors.length);
 assert.deepEqual(members.map(o=>o.candidate.id).sort(),colors.map(c=>c.id).sort());
 for(const {candidate,source} of members){assert.equal(candidate.sourceId,source.id);assert.equal(candidate.sourceSha256,source.sha256);assert.strictEqual(candidate,draft.candidates.find(c=>c.id===candidate.id));}
 assert(groups.length<colors.length);
 assert(groups.some(g=>g.color==='#fff8faff'));assert(groups.some(g=>g.color==='#fff8f9ff'));
 assert.equal(JSON.stringify(draft),original);
});

test('exact duplicates preserve conditional/theme provenance and photo colors stay separate even for identical RGBA',()=>{
 const draft=fixture('large'), groups=groupPaletteColors(draft);
 const red=groups.find(g=>g.color==='#6b2340ff')!;
 assert.equal(new Set(red.observations.map(o=>o.source.id)).size,3);
 assert(red.observations.some(o=>o.candidate.uncertainty.some(s=>s.includes('Theme'))));
 const photo=groups.find(g=>g.category==='raster-color')!;
 assert(groups.find(g=>g.category==='ui-color' && g.color===photo.color));
 assert.notEqual(groups.find(g=>g.category==='ui-color' && g.color===photo.color)!.key,photo.key);
});

test('search finds human color families, sources, hints, IDs and uncertainty; opacity/source filters retain every group member',()=>{
 const groups=groupPaletteColors(fixture('large'));
 assert(filterPaletteColors(groups,'blue','','all').length>0);
 assert(filterPaletteColors(groups,'DARK-THEME','','all').length>0);
 const member=groups[0].observations[0];
 assert.equal(filterPaletteColors(groups,member.candidate.id,'','all')[0],groups[0]);
 const filtered=filterPaletteColors(groups,'#6b2340',member.source.id,'opaque');
 assert.equal(filtered[0],groups[0]);assert.equal(filtered[0].observations.length,groups[0].observations.length);
 assert(filterPaletteColors(groups,'','', 'alpha').every(g=>!g.color.endsWith('ff')));
 assert(filterPaletteColors(groups,'','', 'opaque').every(g=>g.color.endsWith('ff')));
 assert.equal(filterPaletteColors(groups,'no-such-synthetic-color','','all').length,0);
 assert.equal(filterPaletteColors(groups,'   ','','all').length,groups.length);
 assert.equal(filterPaletteColors(groups,'dark-theme',member.source.id,'all').length,0,'query and source must match the same observation');
});

test('selecting any duplicate refers to that exact candidate/source, not an invented group representative',()=>{
 const draft=fixture('large'), group=groupPaletteColors(draft).find(g=>g.color==='#6b2340ff')!;
 for(const {candidate} of group.observations){
  const choices=choosePaletteObservation({},'accent',candidate);
  const result=reviewPalette(draft,choices,resolveVisualDirection().tokens);
  assert(result.snapshot);assert.equal(result.snapshot.selections[0].candidateId,candidate.id);
  assert.equal(result.snapshot.selections[0].sourceId,candidate.sourceId);
  assert.equal(result.snapshot.selections[0].sourceSha256,candidate.sourceSha256);
  assert.equal(result.snapshot.ownerConfirmed,false);assert.equal(result.snapshot.sourceBytesVerified,false);
 }
});

test('pending alpha correction, contrast recovery and external override/direction validation do not mutate evidence',()=>{
 const draft=fixture('large'), before=JSON.stringify(draft), defaults=resolveVisualDirection().tokens;
 const alpha=draft.candidates.find(c=>c.observed==='#12345680')!;
 const pending=choosePaletteObservation({},'accent',alpha);
 assert.equal(pending.accent!.value,'');assert(reviewPalette(draft,pending,defaults).error);
 const corrected={accent:{candidateId:alpha.id,value:'#123456'}};
 const result=reviewPalette(draft,corrected,defaults);assert(result.snapshot);
 assert.equal(result.snapshot.selections[0].review,'corrected');assert.equal(result.snapshot.selections[0].originalValue,'#12345680');
 assert(reviewPalette(draft,{accent:{candidateId:alpha.id,value:'#888888'}},defaults).error);
 assert(reviewPalette(draft,corrected,defaults,'#ffffff').error);
 assert.equal(paletteTokens(defaults,result.snapshot,'#163f64').accent,'#163f64');
 assert(reviewPalette(draft,corrected,resolveVisualDirection('editorial').tokens).snapshot);
 assert.equal(JSON.stringify(draft),before);
});

test('small/insufficient evidence and manual/default choices stay explicit; filtering does not change pending selections',()=>{
 assert.equal(groupPaletteColors(fixture('small')).length,3);
 assert.equal(groupPaletteColors(fixture('empty')).length,0);
 assert.deepEqual(reviewPalette(fixture('small'),{},resolveVisualDirection().tokens),{});
 const d=fixture('large'), choice=choosePaletteObservation({},'accent',d.candidates[0]);const before=JSON.stringify(choice);
 filterPaletteColors(groupPaletteColors(d),'no matches','','all');
 assert.equal(JSON.stringify(choice),before);
 assert.equal(colorName('#ffffffff'),'White');assert.equal(colorName('#12345680'),'Translucent dark blue');
});
