import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { BASE_CATALOG, createCatalog, createFormValues, getAsset } from "../src/lib/campaign-lab/fixtures.ts";
import { createEditorPreviewState, evaluateOfferAlternative } from "../src/lib/campaign-lab/editor.ts";
import { runCampaignGeneration } from "../src/lib/campaign-lab/generation/service.ts";
import type { PilotBundle } from "../src/lib/campaign-lab/types.ts";
import { resolveStory, storyConfiguration, storyRevision, assertCurrentStory, captureStorySource, STORY_DEFINITIONS, STORY_BEATS, validateStoryDefinition } from "../src/lib/campaign-lab/story.ts";
import { storyRuntimeSource } from "../src/lib/campaign-lab/story-runtime.ts";
import { buildCampaignExportBundle, sameExportGuard } from "../src/lib/campaign-lab/export.ts";
import type { CampaignExportSnapshot } from "../src/lib/campaign-lab/export.ts";

const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const story = resolveStory();

test("pilot/base conflicting ID (source and fit) fails closed through real catalog lookup", () => {
  const base = getAsset("morrow-ceramic-dripper-front")!;
  const conflicting = {...base, src: "/campaign-lab-pilots/conflict/hero.webp", imageFit: "cover" as const, contentHash: "a".repeat(64)};
  const catalog = createCatalog({ brand: BASE_CATALOG.brands[base.brandId], fixture: BASE_CATALOG.fixtures["morrow-advertorial-full"], assets: [conflicting], pilot: {id:"momisa", label:"Synthetic collision", status:"preview", note:"Test"} } as PilotBundle);
  assert.equal(catalog.assets.filter(asset => asset.id === base.id).length, 2);
  assert.throws(() => getAsset(base.id, catalog), /Ambiguous approved asset ID/);
  const storyConflict = {...BASE_CATALOG, assets:[...BASE_CATALOG.assets, {...story.beats[0].asset, src:"/different.svg", imageFit:"cover" as const}]};
  assert.throws(() => resolveStory(storyConflict), /Ambiguous/);
});

test("closed sequence uses exact approved story IDs, roles and independently hashed repository bytes", () => {
  const cases = JSON.parse(readFileSync("tests/fixtures/campaign-eval/cases.json","utf8"));
  const rich = cases.cases.find((item: {id:string}) => item.id === "rich-angle");
  for (const beat of story.beats) {
    const reference = rich.approvedAssets.find((asset: {id:string}) => asset.id === beat.asset.id);
    assert.equal(sha(readFileSync(`public${beat.asset.src}`)), reference.sha256);
    assert.equal(beat.asset.role, reference.role);
    if (beat.copy.source && "quote" in beat.copy.source) assert.equal(beat.copy.text, beat.copy.source.quote);
  }
  assert.equal(story.brief.offer, rich.campaign.offer);
  assert.equal(story.brief.destinationUrl, rich.campaign.destinationUrl);
  assert.equal(story.brief.actionLabel, rich.campaign.actionLabel);
});

test("content, brand, config and runtime participate in identity; modes cannot share approval", () => {
  const ids = ["static","instant","motion"].map(mode => storyRevision(mode as "static"));
  assert.equal(new Set(ids).size, 3);
  const changed = {...BASE_CATALOG, assets: BASE_CATALOG.assets.map(asset => asset.id === "morrow-ribs" ? {...asset, alt:"Changed approved description"} : asset)};
  assert.notEqual(storyRevision("motion", changed), ids[2]);
  assert.throws(() => assertCurrentStory({...storyConfiguration("motion"), runtimeIdentity:"stale"}), /fresh revision/);
  assert.throws(() => assertCurrentStory({...storyConfiguration("motion"), durationMs:900}), /fresh revision/);
});

function snapshot(mode: "static"|"instant"|"motion" = "motion", definition = STORY_DEFINITIONS[0], catalog = BASE_CATALOG): CampaignExportSnapshot {
  const story = resolveStory(catalog, definition);
  const revision = storyRevision(mode, catalog, definition);
  return {
    capturedAt: new Date().toISOString(), articleHtml: `<article class="product-story">${story.beats.map((beat,index)=>`<section class="story-panel"><img src="data:ornigami-asset,${index}" alt="${beat.asset.alt}"><p>${beat.copy.text}</p></section>`).join("")}</article>`,
    styleInputs: {nodes:[],primaryFontFamily:null,bodyLetterSpacing:null,usedFontFamilies:[]},
    approval:{revision,approvedAt:new Date().toISOString()},
    preview:{revision,status:"preview",productName:story.brief.productName,brandName:story.brand.name,offer:story.brief.offer,destinationUrl:story.brief.destinationUrl,actionLabel:story.brief.actionLabel,template:{id:"product-story",version:"1.0.0",layout:"two-beat",sections:["story"]},asset:{...story.beats[0].asset},assets:story.beats.map(beat=>({...beat.asset})),story:storyConfiguration(mode, definition), storySource: captureStorySource(catalog, definition)},
    guard:{revision,approvalRevision:revision,dirty:false,generating:false,imagesReady:true},
    packshot:{blob:null,...story.beats[0].asset},
  };
}

test("real bundle preserves distinct assets, alt, hashes, provenance and local references in all variants", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => new Response(readFileSync(`public${url}`),{headers:{"content-type":"image/svg+xml"}})) as typeof fetch;
  try {
    for (const mode of ["static","instant","motion"] as const) {
      const bundle = await buildCampaignExportBundle(snapshot(mode));
      assert.equal(bundle.receipt.assets?.length,2);
      assert.equal(new Set(bundle.receipt.assets!.map(asset=>asset.file)).size,2);
      for (const asset of bundle.receipt.assets!) {
        assert.equal(asset.exportedSha256,asset.contentHash);
        assert.equal(asset.source, getAsset(asset.id)!.source);
        assert.equal(asset.rights, getAsset(asset.id)!.rights);
        assert.ok(bundle.receipt.references.images.includes(asset.file));
      }
      assert.deepEqual(bundle.receipt.references.scripts ?? [],mode === "static" ? [] : ["story.js"]);
      assert.equal(bundle.files.filter(file=>file.path.endsWith('.svg')).length,2);
    }
  } finally {globalThis.fetch=originalFetch;}
});

test("packaging rejects stale runtime, changed handles, bytes and cancellation during asset read", async () => {
  const originalFetch=globalThis.fetch;
  try {
    const stale=snapshot(); stale.preview.story!.runtimeIdentity="changed";
    await assert.rejects(buildCampaignExportBundle(stale),/fresh revision/);
    const changed=snapshot(); changed.preview.assets![1].alt="Changed";
    await assert.rejects(buildCampaignExportBundle(changed),/content\/assets changed/);
    globalThis.fetch=(async()=>new Response("wrong",{headers:{"content-type":"image/svg+xml"}})) as typeof fetch;
    await assert.rejects(buildCampaignExportBundle(snapshot()),/SHA-256 mismatch/);
    const value=snapshot(); let current={...value.guard};
    globalThis.fetch=(async(url:string)=> {current={...current,approvalRevision:null}; return new Response(readFileSync(`public${url}`),{headers:{"content-type":"image/svg+xml"}});}) as typeof fetch;
    await assert.rejects(buildCampaignExportBundle(value,{isStillApproved: expected=>sameExportGuard(expected,current)}),/cancelled/i);
  } finally {globalThis.fetch=originalFetch;}
});

/** Small DOM event double for runtime branches unavailable in the app browser.
 * This is a logic test, not a claim of real device or native media emulation. */
class Node extends EventTarget {
  style: Record<string, string | ((key:string,value:string)=>void) | ((key:string)=>void)> = Object.assign({}, {setProperty:(key:string,value:string)=>{Object.assign(this.style,{[key]:value});},removeProperty:(key:string)=>{delete this.style[key];}});
  attrs = new Map<string,string>(); hidden=true; inert=false; focused=false;
  complete=true; naturalWidth=1200;
  setAttribute(key:string,value:string){this.attrs.set(key,value);}
  removeAttribute(key:string){this.attrs.delete(key);if(key==='style')for(const key of Object.keys(this.style))if(typeof this.style[key]==='string')delete this.style[key];}
  focus(){this.focused=true;}
}
function runtime(mode="motion", reduce=false, failure=false, count=2) {
  const root=new Node(), track=new Node(), controls=new Node();
  const panels=Array.from({length:count},()=>new Node()),buttons=Array.from({length:count},()=>new Node()),images=Array.from({length:count},()=>new Node());
  const classes=new Set<string>();
  Object.assign(root,{classList:{add:(x:string)=>classes.add(x),remove:(x:string)=>classes.delete(x)},querySelector:(selector:string)=>selector==='.story-track'?track:controls,querySelectorAll:(selector:string)=>selector==='.story-panel'?panels:selector==='img'?images:buttons});
  const media=Object.assign(new EventTarget(),{matches:reduce});
  const doc=Object.assign(new EventTarget(),{querySelector:()=>root,getElementById:()=>({textContent:JSON.stringify({mode})})});
  if(failure) buttons[1].addEventListener=()=>{throw new Error('init failure');};
  vm.runInNewContext(storyRuntimeSource(),{document:doc,matchMedia:()=>media});
  return {root,track,controls,panels,buttons,images,classes,media};
}
function click(button:Node,detail=1){const event=new Event('click');Object.assign(event,{detail});button.dispatchEvent(event);}

test("runtime instant/reduced motion keep interaction; reversed input retargets; keyboard preserves focus", () => {
  for(const [mode,reduce] of [["instant",false],["motion",true],["motion",false]] as const){
    const r=runtime(mode,reduce);
    assert.equal(r.controls.hidden,false);
    for(const index of [1,0,1,0,1])click(r.buttons[index]);
    assert.equal(r.track.style.transform,'translateX(-50%)');
    assert.equal(r.track.style.transition,mode==='motion'&&!reduce?'transform 250ms cubic-bezier(0.23, 1, 0.32, 1)':'none');
    assert.equal(r.panels[0].inert,true);assert.equal(r.panels[1].inert,false);
    const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:'Home'});r.controls.dispatchEvent(event);
    assert.equal(r.track.style.transition,'none');assert.ok(r.buttons[0].focused);assert.ok(event.defaultPrevented);
  }
});

test("initialization/image failure restores complete static reading; dynamic reduction stops active motion", () => {
  const failed=runtime("motion",false,true);
  assert.equal(failed.controls.hidden,true);assert.equal(failed.classes.size,0);assert.ok(failed.panels.every(panel=>!panel.inert));
  const r=runtime();click(r.buttons[1]);r.media.dispatchEvent(new Event('change'));assert.equal(r.track.style.transition,'none');
  r.images[1].dispatchEvent(new Event('error'));
  assert.equal(r.classes.size,0);assert.equal(r.controls.hidden,true);assert.ok(r.panels.every(panel=>!panel.inert));
});


test("both registered definitions resolve approved copy/facts and distinct exact-byte assets", () => {
  assert.deepEqual(STORY_DEFINITIONS.map(definition=>definition.beats.length),[2,3]);
  for (const definition of STORY_DEFINITIONS) {
    const resolved=resolveStory(BASE_CATALOG,definition);
    for (const beat of resolved.beats) assert.equal(sha(readFileSync(`public${beat.asset.src}`)),beat.asset.contentHash);
    assert.equal(new Set(resolved.beats.map(beat=>beat.asset.id)).size,definition.beats.length);
    if(definition.beats.length===3) {
      const last=resolved.beats[2];
      assert.equal(last.copy.text,BASE_CATALOG.fixtures[definition.campaignId].brief.advertorial!.productTransition);
      assert.equal(last.asset.id,"morrow-pour");assert.equal(last.asset.role,"product-in-use");
      assert.deepEqual(last.copy.source,resolved.brief.productFacts.find(fact=>fact.id===last.factIds[0])!.source);
    }
  }
});

test("definition and catalog validation reject unsupported counts, config, IDs, copy and source roles", () => {
  for(const change of [{schemaVersion:2},{presentation:"autoplay"},{beats:STORY_BEATS.slice(0,1)},{beats:[...STORY_BEATS,...STORY_BEATS]},{html:"<script>"}]) {
    assert.throws(()=>validateStoryDefinition({...STORY_DEFINITIONS[0],...change}),/definition|beats/);
  }
  for(const change of [{copyId:"unknown"},{assetId:"unknown"},{role:"product-in-use"},{factIds:["unknown"]}]) {
    const definition={...STORY_DEFINITIONS[0],beats:STORY_DEFINITIONS[0].beats.map((beat,index)=>index?beat:{...beat,...change})};
    assert.throws(()=>resolveStory(BASE_CATALOG,definition as typeof STORY_DEFINITIONS[number]),/approved story/);
  }
  const catalog=structuredClone(BASE_CATALOG);catalog.fixtures[STORY_DEFINITIONS[0].campaignId].brief.advertorial!.storyBeats[0].source.reviewedBy="";
  assert.throws(()=>resolveStory(catalog),/approved story/);
});

test("export resolves the captured nondefault definition/catalog and all three modes at both lengths", async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async(url:string)=>new Response(readFileSync(`public${url}`),{headers:{"content-type":"image/svg+xml"}})) as typeof fetch;
  try {
    for(const definition of STORY_DEFINITIONS) for(const mode of ["static","instant","motion"] as const) {
      const bundle=await buildCampaignExportBundle(snapshot(mode,definition));
      assert.equal(bundle.receipt.assets!.length,definition.beats.length);
      assert.equal(bundle.receipt.preview.story!.id,definition.id);
    }
    const catalog=structuredClone(BASE_CATALOG), definition={...STORY_DEFINITIONS[1],campaignId:"synthetic-alternate"};
    catalog.fixtures[definition.campaignId]=structuredClone(catalog.fixtures[STORY_DEFINITIONS[1].campaignId]);
    catalog.fixtures[definition.campaignId].brief.offer="Free shipping through 30 November 2026 — synthetic alternate";
    catalog.brands["morrow-ceramic"].name="Synthetic alternate Morrow";
    const value=snapshot("motion",definition,catalog);
    const bundle=await buildCampaignExportBundle(value);
    assert.equal(bundle.receipt.preview.offer,catalog.fixtures[definition.campaignId].brief.offer);
    assert.equal(bundle.receipt.preview.brandName,"Synthetic alternate Morrow");
    const stale=snapshot("motion",definition,catalog);stale.preview.storySource!.catalog.fixtures[definition.campaignId].brief.copy.headline="Changed after capture";
    await assert.rejects(buildCampaignExportBundle(stale),/content\/assets changed/);
  } finally {globalThis.fetch=originalFetch;}
});

test("three-panel packaged runtime supports End/Home, rapid reverse and canonical recovery", () => {
  for(const mode of ["instant","motion"]) {
    const r=runtime(mode,false,false,3);
    assert.equal(r.root.style["--story-count"],"3");
    for(const index of [2,0,2,1,2])click(r.buttons[index]);
    assert.equal(r.track.style.transform,`translateX(-${200/3}%)`);
    const key=(name:string)=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:name});r.controls.dispatchEvent(event);};
    key("Home");assert.equal(r.track.style.transform,"translateX(-0%)");assert.ok(r.buttons[0].focused);
    key("End");assert.ok(r.buttons[2].focused);assert.equal(r.track.style.transition,"none");
    r.images[2].dispatchEvent(new Event("error"));assert.ok(r.panels.every(panel=>!panel.inert));assert.equal(r.controls.hidden,true);
  }
});


test("ordinary editor and generation turn known missing/conflicting assets into recoverable issues", async () => {
  const fixture=BASE_CATALOG.fixtures.sparse, values=createFormValues(fixture), base=getAsset(values.assetId)!;
  for(const assets of [BASE_CATALOG.assets.filter(asset=>asset.id!==base.id),[...BASE_CATALOG.assets,{...base,src:"/campaign-lab-pilots/collision/hero.webp",imageFit:"cover" as const}]]) {
    const catalog={...BASE_CATALOG,assets};
    const initial=createEditorPreviewState(fixture,values,catalog);
    assert.equal(initial.preview,null);assert.equal(initial.dirty,true);
    assert.ok(initial.issues.some(issue=>issue.field==="assetId" && /reload/.test(issue.message)));
    const alternative=evaluateOfferAlternative(fixture,values,catalog);assert.equal(alternative.ok,false);
    let providerCalls=0;
    const result=await runCampaignGeneration({fixtureId:fixture.id,values},{catalog,provider:{id:"local-test",label:"Not called",generate:async()=>{providerCalls++;throw Error("Must not run");}}});
    assert.equal(result.ok,false);assert.equal(providerCalls,0);
    if(assets.length>BASE_CATALOG.assets.length) assert.ok(initial.issues[0].message.includes(base.src) && initial.issues[0].message.includes("/campaign-lab-pilots/collision/hero.webp"));
    assert.equal(BASE_CATALOG.assets.find(asset=>asset.id===base.id),base);
  }
});


test("cancellation during the last required image read rejects both captured definitions", async () => {
  const originalFetch=globalThis.fetch;
  try {
    for(const definition of STORY_DEFINITIONS) {
      const value=snapshot("motion",definition);let guard={...value.guard},reads=0;
      globalThis.fetch=(async(url:string)=>{
        if(++reads===definition.beats.length) guard={...guard,approvalRevision:null};
        return new Response(readFileSync(`public${url}`),{headers:{"content-type":"image/svg+xml"}});
      }) as typeof fetch;
      await assert.rejects(buildCampaignExportBundle(value,{isStillApproved: expected=>sameExportGuard(expected,guard)}),/cancelled/i);
      assert.equal(reads,definition.beats.length);
    }
  } finally {globalThis.fetch=originalFetch;}
});
