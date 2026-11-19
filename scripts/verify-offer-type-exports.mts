import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import { assertHtmlReceiptAgreement, auditArchiveReferences } from '../src/lib/campaign-lab/export.ts';
const root=resolve(process.argv[2]??'.local/typography');
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const results=[];
for(const name of ['rose-clear','rose-editorial','fjord-clear','fjord-editorial','rose-clear-before']) {
  const historical=name.endsWith('-before');
  const dir=join(root,historical?'export-rose-clear-before':'export-final-'+name);
  const receipt=JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'));
  const html=await readFile(join(dir,'index.html'),'utf8');const css=await readFile(join(dir,'styles.css'),'utf8');
  assertHtmlReceiptAgreement(html,receipt);
  const paths=(await readdir(dir,{recursive:true})).map(path=>String(path).replaceAll('\\','/'));
  const references=auditArchiveReferences(html,css,paths);assert.ok(references.checked>0);
  for(const file of receipt.files){const bytes=await readFile(join(dir,file.path));assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);}
  const id=name.startsWith('rose')?'rose':'fjord';
  const brief=JSON.parse(await readFile(`docs/examples/brand-review/${id}/brief.json`,'utf8'));
  for(const key of ['productName','brandName','offer','destinationUrl'])assert.equal(receipt.preview[key],brief[key]);
  for(const fact of brief.facts)assert.ok(html.includes(fact.label)&&html.includes(fact.value));
  const packshot=await readFile(`docs/examples/brand-review/${id}/packshot.png`);
  assert.equal(receipt.asset.exportedSha256,hash(packshot));assert.equal(receipt.asset.alt,brief.alt);
  assert.equal(hash(await readFile(join(dir,receipt.asset.file))),hash(packshot));
  assert.equal(receipt.preview.template.version,historical?'1.0.0':'1.0.1');
  assert.equal(receipt.preview.motion.recipe,'none');assert.equal(receipt.preview.actionLabel,'Shop now');
  assert.equal(receipt.approval.revision,receipt.approval.renderedRevision);
  assert.equal(receipt.preview.visualDirection.id,name.includes('editorial')?'editorial':'clear');
  assert.equal(receipt.preview.appearance.accent,name.includes('editorial')?'#234a6b':'#2f5d4a');
  results.push({name,version:receipt.preview.template.version,revision:receipt.approval.revision,
    files:receipt.files.length,references:references.checked,packshot:hash(packshot),fonts:receipt.fonts.length});
}
const parity=JSON.parse(await readFile(join(root,'export-parity.json'),'utf8'));
assert.equal(parity.length,4);
for(const item of parity) {
  assert.equal(item.preview.article.width,item.export.article.width);
  for(const key of ['fontSize','lineHeight','text','imageFit'])assert.equal(item.preview[key],item.export[key]);
  assert.deepEqual(item.preview.lines.map((line:{text:string})=>line.text),item.export.lines.map((line:{text:string})=>line.text));
  assert.ok(item.export.imageLoaded&&!item.export.headingOverflow&&!item.export.documentOverflow);
}
await writeFile(join(root,'export-audit.json'),JSON.stringify({results,matchingWidthParity:4},null,2)+'\n');
console.log(JSON.stringify({archives:results.length,matchingWidthParity:4,results:results.map(result=>({name:basename(result.name),revision:result.revision,files:result.files}))}));
