import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { BASE_CATALOG, createCatalog, getAsset } from "../src/lib/campaign-lab/fixtures.ts";
import type { PilotBundle } from "../src/lib/campaign-lab/types.ts";
import { resolveStory, storyConfiguration, storyRevision, assertCurrentStory } from "../src/lib/campaign-lab/story.ts";
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
    assert.equal(beat.copy.text, beat.copy.source.quote);
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

function snapshot(mode: "static"|"instant"|"motion" = "motion"): CampaignExportSnapshot {
  const revision = storyRevision(mode);
  return {
    capturedAt: new Date().toISOString(), articleHtml: `<article class="product-story">${story.beats.map((beat,index)=>`<section class="story-panel"><img src="data:ornigami-asset,${index}" alt="${beat.asset.alt}"><p>${beat.copy.text}</p></section>`).join("")}</article>`,
    styleInputs: {nodes:[],primaryFontFamily:null,bodyLetterSpacing:null,usedFontFamilies:[]},
    approval:{revision,approvedAt:new Date().toISOString()},
    preview:{revision,status:"preview",productName:story.brief.productName,brandName:story.brand.name,offer:story.brief.offer,destinationUrl:story.brief.destinationUrl,actionLabel:story.brief.actionLabel,template:{id:"product-story",version:"1.0.0",layout:"two-beat",sections:["story"]},asset:{...story.beats[0].asset},assets:story.beats.map(beat=>({...beat.asset})),story:storyConfiguration(mode)},
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
  style: Record<string,string> = {};
  attrs = new Map<string,string>(); hidden=true; inert=false; focused=false;
  complete=true; naturalWidth=1200;
  setAttribute(key:string,value:string){this.attrs.set(key,value);}
  removeAttribute(key:string){this.attrs.delete(key);if(key==='style')this.style={};}
  focus(){this.focused=true;}
}
function runtime(mode="motion", reduce=false, failure=false) {
  const root=new Node(), track=new Node(), controls=new Node();
  const panels=[new Node(),new Node()],buttons=[new Node(),new Node()],images=[new Node(),new Node()];
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
