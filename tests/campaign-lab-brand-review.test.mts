import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseBrandEvidence, parseBrandSnapshot, paletteTokens, BRAND_FILE_BYTES, BrandEvidenceFileReader } from "../src/lib/campaign-lab/brand-review.ts";
import { resolveVisualDirection, browserDirectionCatalog } from "../src/lib/campaign-lab/visual-directions.ts";
import { buildBrowserOfferCatalog } from "../src/lib/campaign-lab/browser-offer.ts";
import { browserOfferBriefFromIntake, parseBrowserOfferBriefRequest } from "../src/lib/campaign-lab/browser-offer-brief.ts";
import { createFormValues } from "../src/lib/campaign-lab/fixtures.ts";
import { buildCampaignPreview } from "../src/lib/campaign-lab/template.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import { parsePersistedOfferIntakeBrief, parsePreparedOfferIntakeBrief, serializePersistedOfferIntakeBrief } from "../src/lib/campaign-lab/offer-intake-brief.ts";
const load=(id:string,file:string)=>readFileSync(new URL(`../docs/examples/brand-review/${id}/${file}`,import.meta.url),'utf8');
const draft=(id='rose')=>parseBrandEvidence(load(id,'evidence.json'));
function snapshot(id='rose') {
 const d=draft(id); const values=id==='rose'?['#6b2340','#fff8fa','#f5e6ea']:['#163f64','#f5f9ff','#e5effb'];
 return parseBrandSnapshot({schemaVersion:'ornigami-brand-snapshot/1.0.0',draftSchemaVersion:d.schemaVersion,extractorVersion:d.extractorVersion,provenance:'imported-claims-unverified',reviewMethod:'local-operator-palette',selections:['accent','page','surface'].map((role,i)=>{const c=d.candidates.find(c=>c.category==='ui-color'&&c.observed===values[i]+'ff')!;return {role,value:values[i],candidateId:c.id,originalValue:c.observed,sourceId:c.sourceId,sourceSha256:c.sourceSha256,method:c.method,category:c.category,review:'selected'};}),ownerConfirmed:false,campaignFactsApproved:false,mediaRightsApproved:false,sourceBytesVerified:false});
}
test('frozen draft validation rejects hostile configuration, purported approvals, references, offsets and bounds',()=>{
 const d=draft(); const before=JSON.stringify(d); assert.equal(d.approvals.brand,false);
 const mutations: ((v: ReturnType<typeof JSON.parse>) => unknown)[] = [v=>v.schemaVersion='9000',v=>v.catalog={},v=>v.approvals.brand=true,v=>v.candidates[0].sourceSha256='a'.repeat(64),v=>v.candidates[0].evidence.utf16Offset=1000000,v=>v.candidates.push(v.candidates[0]),v=>v.candidates[0].details.css='body{}'];
 for(const mutate of mutations) {const v=structuredClone(d); mutate(v); assert.throws(()=>parseBrandEvidence(JSON.stringify(v)));}
 assert.throws(()=>parseBrandEvidence(' '.repeat(BRAND_FILE_BYTES+1))); assert.throws(()=>parseBrandEvidence('{'));
 const hostile=structuredClone(d);hostile.candidates[0].evidence.quote='<script>alert(1)</script>';assert.equal(parseBrandEvidence(JSON.stringify(hostile)).candidates[0].evidence.quote,hostile.candidates[0].evidence.quote);
 assert.equal(JSON.stringify(d),before);
});
test('opaque correction preserves alpha and contrast checks dependent rendered roles',()=>{
 const s=snapshot();const alpha=draft().candidates.find(c=>c.observed==='#12345680')!;
 const v={...s,selections:[{...s.selections[0],originalValue:alpha.observed,candidateId:alpha.id,value:'#123456',review:'selected'}]};assert.throws(()=>parseBrandSnapshot(v));
 v.selections[0].review='corrected';const corrected=parseBrandSnapshot(v);assert.equal(corrected.selections[0].originalValue,'#12345680');
 assert.equal(paletteTokens(resolveVisualDirection().tokens,corrected).accent,'#123456');
 for(const [role,value] of [['page','#111111'],['accent','#ffffff'],['accent','#888888']]) {const invalid=structuredClone(s);invalid.selections.find(v=>v.role===role)!.value=value;invalid.selections.find(v=>v.role===role)!.review='corrected';assert.throws(()=>paletteTokens(resolveVisualDirection().tokens,invalid));}
 assert.throws(()=>parseBrandSnapshot({...s,tokens:{accent:'#123456'}})); assert.throws(()=>parseBrandSnapshot({...s,sourceBytesVerified:true}));
 assert.throws(()=>parseBrandSnapshot({...s,selections:[s.selections[0],s.selections[0]]}));
});
for(const id of ['rose','fjord'])test(`${id}: browser/server, defaults, override removal, restoration, generation and invalid/timeout fallback agree`,async()=>{
 const s=snapshot(id); const brief=JSON.parse(load(id,'brief.json'));const before=structuredClone(brief);
 const input={...brief,brandKitSnapshot:s,packshot:{src:'blob:fixture',width:600,height:700,alt:brief.alt,rights:brief.rights,contentHash:'b'.repeat(64)},reviewedOn:'2026-11-19',confirmations:{offer:brief.offer,destination:brief.destinationUrl,rights:brief.rights}};
 const request=browserOfferBriefFromIntake(input);const parsed=parseBrowserOfferBriefRequest(request);assert(parsed.ok);if(!parsed.ok)return;
 const built=buildBrowserOfferCatalog(parsed.input);const values=createFormValues(built.fixture,built.catalog);assert.deepEqual(values.brandKitSnapshot,s);
 const local=buildCampaignPreview(built.fixture,values,built.catalog);assert(local.ok);if(!local.ok)return;
 for(const mode of ['success','invalid','timeout']){const result=await runCampaignGeneration({fixtureId:built.fixture.id,values,requestId:'review'},{catalog:built.catalog,env:{CAMPAIGN_LAB_GENERATION_PROVIDER:'local-test',CAMPAIGN_LAB_GENERATION_TEST_MODE:mode,CAMPAIGN_LAB_GENERATION_TIMEOUT_MS:'250'}});assert(result.ok);if(!result.ok)continue;assert.deepEqual(result.preview.theme.tokens,local.preview.theme.tokens);assert.equal(result.preview.brief.offer,brief.offer);assert.equal(result.preview.asset.contentHash,input.packshot.contentHash);}
 const old=buildBrowserOfferCatalog({...input,brandKitSnapshot:undefined});const oldPreview=buildCampaignPreview(old.fixture,createFormValues(old.fixture,old.catalog),old.catalog);assert(oldPreview.ok);if(oldPreview.ok)assert.notEqual(oldPreview.preview.revision,local.preview.revision);
 for(const direction of ['clear','editorial']){const overridden=browserDirectionCatalog(built.catalog,direction,s,'#123456');assert.equal(overridden.brands['browser-offer-brand'].tokens.accent,'#123456');const exposed=browserDirectionCatalog(built.catalog,direction,s);assert.equal(exposed.brands['browser-offer-brand'].tokens.accent,s.selections[0].value);}
 const restored=parsePersistedOfferIntakeBrief(serializePersistedOfferIntakeBrief({...brief,brandKitSnapshot:s,accent:'#123456'}));assert.deepEqual(restored!.brandKitSnapshot,s);assert.equal(restored!.accent,'#123456');assert(!JSON.stringify(restored).includes('blob:'));assert(!('approval' in restored!)); assert(!('confirmations' in restored!));
 assert(parsePreparedOfferIntakeBrief(JSON.stringify(brief)).ok);const prepared=parsePreparedOfferIntakeBrief(JSON.stringify(brief));if(prepared.ok)assert(!prepared.brief.brandKitSnapshot);
 assert.equal(parsePersistedOfferIntakeBrief(JSON.stringify({...brief,brandKitSnapshot:{...s,selections:[]}})),null);
 assert.deepEqual(brief,before);assert.equal(built.verification.provisional,false);
 const badPalette=structuredClone(s);badPalette.selections[0].value='#ffffff';badPalette.selections[0].review='corrected';assert.equal(parsePreparedOfferIntakeBrief(JSON.stringify({...brief,brandKitSnapshot:badPalette})).ok,false);
 const badParsed=parseBrowserOfferBriefRequest({...request,brandKitSnapshot:badPalette});assert.equal(badParsed.ok,false);if(!badParsed.ok)assert(badParsed.issues.some(v=>v.field==='accent'));
 const invalid={...request,brandKitSnapshot:{...s,tokens:{accent:'#123456'}}};assert.equal(parseBrowserOfferBriefRequest(invalid).ok,false);
});

test('file selection stream rejects oversize before reading, retries same file and suppresses late success/error/cancelled results',async()=>{
 const reader=new BrandEvidenceFileReader(); let reads=0;
 const tooLarge=await reader.read({size:BRAND_FILE_BYTES+1,text:async()=>{reads++;return '{}';}});assert(!tooLarge.stale && tooLarge.error);assert.equal(reads,0);
 const valid={size:100,text:async()=>load('rose','evidence.json')};
 let finish!: (s:string)=>void; const old=reader.read({size:100,text:()=>new Promise(resolve=>{finish=resolve;})});
 const current=await reader.read(valid);assert(!current.stale && current.draft);finish(load('fjord','evidence.json'));assert.deepEqual(await old,{stale:true});
 const oldError=reader.read({size:100,text:()=>new Promise(resolve=>{finish=resolve;})});await reader.read(valid);finish('{');assert.deepEqual(await oldError,{stale:true});
 assert(!((await reader.read({size:1,text:async()=>'{'})) as {draft?:unknown}).draft);
 for(let i=0;i<2;i++){const r=await reader.read(valid);assert(!r.stale && r.draft);}
 const cancelled=reader.read({size:100,text:()=>new Promise(resolve=>{finish=resolve;})});reader.cancel();finish(load('rose','evidence.json'));assert.deepEqual(await cancelled,{stale:true});
});
