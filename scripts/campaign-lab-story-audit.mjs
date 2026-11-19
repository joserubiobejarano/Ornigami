/** Audit canonical browser-produced ZIPs; no browser/model/network required.
 * node --experimental-strip-types scripts/campaign-lab-story-audit.mjs [directory] [baseline-worktree]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {crc32,assertHtmlReceiptAgreement,auditArchiveReferences} from '../src/lib/campaign-lab/export.ts';
import {createCatalog,getAsset,BASE_CATALOG} from '../src/lib/campaign-lab/fixtures.ts';

const directory=path.resolve(process.argv[2]??'.local/story-session2');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function checkPackagedRuntime(source,config,reduce=false,fail=false){
 class Element extends EventTarget {
  style={};hidden=true;inert=false;complete=true;naturalWidth=1200;attrs=new Map();
  setAttribute(key,value){this.attrs.set(key,value);}
  removeAttribute(key){this.attrs.delete(key);if(key==='style')this.style={};}
  focus(){this.focused=true;}
 }
 const root=new Element(),track=new Element(),controls=new Element();
 const panels=[new Element(),new Element()],buttons=[new Element(),new Element()],images=[new Element(),new Element()],classes=new Set();
 Object.assign(root,{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},querySelector:s=>s==='.story-track'?track:controls,querySelectorAll:s=>s==='.story-panel'?panels:s==='img'?images:buttons});
 const media=Object.assign(new EventTarget(),{matches:reduce});
 const document=Object.assign(new EventTarget(),{querySelector:()=>root,getElementById:()=>({textContent:JSON.stringify(config)})});
 if(fail)buttons[1].addEventListener=()=>{throw Error('Injected initialization failure');};
 // No fetch, network, filesystem, process or module globals exist inside this VM.
 vm.runInNewContext(source,{document,matchMedia:()=>media},{timeout:1000});
 if(fail){assert.equal(classes.size,0);assert.equal(controls.hidden,true);return;}
 assert.equal(controls.hidden,false);
 for(const index of [1,0,1]){const click=new Event('click');Object.assign(click,{detail:1});buttons[index].dispatchEvent(click);}
 assert.equal(track.style.transform,'translateX(-50%)');
 assert.equal(track.style.transition,config.mode==='motion'&&!reduce?'transform 250ms cubic-bezier(0.23, 1, 0.32, 1)':'none');
 assert.deepEqual(panels.map(panel=>panel.inert),[true,false]);
 images[1].dispatchEvent(new Event('error'));assert.equal(classes.size,0);assert.ok(panels.every(panel=>!panel.inert));
}
const results=[];
let referenceContent;
for(const mode of ['static','instant','motion']){
  const bytes=fs.readFileSync(path.join(directory,mode+'.zip'));
  const files=new Map(); let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0,'Stored ZIP expected');
    const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString();
    assert.ok(!name.includes('..')&&!path.isAbsolute(name));
    const start=offset+30+nameLength+extra,data=bytes.subarray(start,start+size);
    assert.equal(crc32(data),bytes.readUInt32LE(offset+14));
    assert.ok(!files.has(name)); files.set(name,data);offset=start+size;
  }
  const receipt=JSON.parse(files.get('receipt.json'));
  const html=files.get('index.html').toString(),css=files.get('styles.css').toString();
  assertHtmlReceiptAgreement(html,receipt);
  if(mode!=='static')for(const [reduce,fail] of [[false,false],[true,false],[false,true]])checkPackagedRuntime(files.get('story.js').toString(),receipt.preview.story,reduce,fail);
  auditArchiveReferences(html,css,[...files.keys()]);
  assert.equal(receipt.assets.length,2);
  for(const file of receipt.files){assert.equal(hash(files.get(file.path)),file.sha256);assert.equal(files.get(file.path).length,file.bytes);}
  for(const asset of receipt.assets){assert.equal(hash(files.get(asset.file)),asset.contentHash);assert.equal(asset.contentHash,asset.exportedSha256);assert.equal(hash(fs.readFileSync(path.join('public',asset.src))),asset.contentHash);assert.ok(asset.rights&&asset.source);}
  assert.equal(new Set(receipt.assets.map(asset=>asset.file)).size,2);
  assert.ok(!/story-enhanced|aria-hidden="true"|\binert\b|data-approved-asset-id|translateX/.test(html));
  assert.ok(!/\son\w+=|javascript:|<iframe|<svg\b/.test(html));
  const rawArticle=html.match(/<article[\s\S]*?<\/article>/)[0];
  assert.match(rawArticle,/<div class="story-controls"(?=[^>]* hidden="")/);
  // DOM attribute insertion order changes when enhancement removes/re-adds hidden.
  const article=rawArticle.replace(/<div class="story-controls"[^>]*>/,tag=>tag.replace(' hidden=""','').replace('>',' hidden="">'));
  if(referenceContent)assert.equal(article,referenceContent,'Canonical narrative/content/assets must match across modes');
  referenceContent=article;
  const output=path.join(directory,mode);fs.mkdirSync(output,{recursive:true});
  for(const [name,data] of files){const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  const fallback=path.join(directory,mode+'-no-runtime');fs.mkdirSync(fallback,{recursive:true});
  for(const [name,data] of files){if(name==='story.js')continue;const target=path.join(fallback,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  results.push({mode,revision:receipt.approval.revision,archiveSha256:hash(bytes),archiveBytes:bytes.length,gzipBytes:gzipSync(bytes).length,runtimeBytes:files.get('story.js')?.length??0,packagedRuntimeOfflineVM:mode==='static'?'No executable runtime': 'Normal/reduced/init failure/image failure/reversed selection pass; event-double logic, not a browser test',assets:receipt.assets.map(({id,file,exportedSha256,alt})=>({id,file,exportedSha256,alt})),references:receipt.references});
}
let collision;
if(process.argv[3]){
 const baseline=await import(pathToFileURL(path.join(path.resolve(process.argv[3]),'src/lib/campaign-lab/fixtures.ts')).href);
 const base=baseline.getAsset('morrow-ceramic-dripper-front');
 const pilot={brand:BASE_CATALOG.brands[base.brandId],fixture:BASE_CATALOG.fixtures['morrow-advertorial-full'],assets:[{...base,src:'/campaign-lab-pilots/conflict/hero.webp',contentHash:'a'.repeat(64),imageFit:'cover'}],pilot:{id:'momisa',label:'Synthetic conflict',status:'preview',note:'Test'}};
 const old=baseline.getAsset(base.id,baseline.createCatalog(pilot));
 assert.equal(old.src,base.src);assert.equal(old.imageFit,'contain');
 assert.throws(()=>getAsset(base.id,createCatalog(pilot)),/Ambiguous/);
 collision={baseline:execFileSync('git',['-C',process.argv[3],'rev-parse','HEAD'],{encoding:'utf8'}).trim(),declared:pilot.assets[0],previouslyResolved:old,current:'Rejected: Ambiguous approved asset ID'};
}
const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results,collision};
fs.writeFileSync(path.join(directory,'archive-audit.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(directory,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Morrow story comparison</title><style>body{font:18px/1.6 system-ui;background:#f2ebde;color:#1d2a3c;max-width:900px;margin:40px auto;padding:24px}a{color:#234a6b}td,th{padding:12px;text-align:left}img{max-width:100%}</style><h1>Morrow: prototype → revised ribs</h1><p>Same approved synthetic narrative, assets and offer. Interaction isolates selection; motion adds a 250 ms directional transition. No performance claim or conversion result.</p><table><tr><th>Variant</th><th>Standalone export</th><th>Archive</th></tr>${results.map(result=>`<tr><td><a href="./${result.mode}/index.html">${result.mode}</a></td><td><a href="./${result.mode}.zip">ZIP</a> · <a href="./${result.mode}/receipt.json">receipt</a></td><td>${result.archiveBytes} bytes</td></tr>`).join('')}</table><p><a href="./archive-audit.json">Asset/hash audit</a> · <a href="./browser-evidence.json">Playback and responsive evidence</a> · <a href="./REPORT.md">Critical review and limitations</a></p><p>Static is the default recommendation. Interaction compresses the reading sequence but hides the second beat until selected. Motion explains sequence direction; no measured comprehension advantage over instant interaction.</p><img src="./motion-375-selected.jpg" alt="Motion variant with revised ribs selected at 375 pixels"></html>`);
console.log(JSON.stringify({exports:results.map(({mode,revision,archiveBytes,gzipBytes})=>({mode,revision,archiveBytes,gzipBytes})),collision:collision?.current},null,2));
