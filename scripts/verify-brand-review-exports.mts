import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { assertHtmlReceiptAgreement, auditArchiveReferences } from '../src/lib/campaign-lab/export.ts';
import { parseBrandSnapshot } from '../src/lib/campaign-lab/brand-review.ts';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const results=[];
const expectedAccent=process.argv.find(v=>v.startsWith("--expect-accent="))?.slice("--expect-accent=".length);
for(const dir of process.argv.slice(2).filter(v=>!v.startsWith("--"))) {
 const receipt=JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'));
 const html=await readFile(join(dir,'index.html'),'utf8'); const css=await readFile(join(dir,'styles.css'),'utf8');
 assertHtmlReceiptAgreement(html,receipt);
 const files=await readdir(dir,{recursive:true});
 const audit=auditArchiveReferences(html,css,files.map(f=>String(f).replaceAll("\\","/")));assert(audit.checked>0);
 for(const file of receipt.files) { const bytes=await readFile(join(dir,file.path));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256); }
 const id=receipt.preview.brandName==='Rose Supply'?'rose':'fjord';
 const brief=JSON.parse(await readFile(`docs/examples/brand-review/${id}/brief.json`,'utf8'));
 for(const key of ['productName','offer','destinationUrl'])assert.equal(receipt.preview[key],brief[key]);
 const image=await readFile(join(dir,receipt.asset.file));assert.equal(sha(image),sha(await readFile(`docs/examples/brand-review/${id}/packshot.png`)));assert.equal(sha(image),receipt.asset.contentHash);assert.equal(receipt.asset.alt,brief.alt);
 const snapshot=parseBrandSnapshot(receipt.preview.visualDirection.brandKitSnapshot);
 assert.equal(snapshot.sourceBytesVerified,false);assert.equal(snapshot.ownerConfirmed,false);
 for(const v of snapshot.selections) {const effective=v.role==="accent" && expectedAccent ? expectedAccent : v.value; assert.equal(receipt.preview.visualDirection.tokens[v.role],effective);assert(html.includes(`--cp-${v.role}: ${effective}`));}
 assert.equal(receipt.approval.revision,receipt.approval.renderedRevision);assert.equal(receipt.verification.provisional,false);
 assert(!html.includes('Unapproved source copy'));assert(!JSON.stringify(receipt).includes('Untrusted marketing claim'));
 assert(receipt.fonts.length || receipt.preview.visualDirection.id==='editorial');
 results.push({directory:dir,revision:receipt.approval.revision,direction:receipt.preview.visualDirection.id,palette:snapshot.selections.map(v=>({role:v.role,value:v.value,originalValue:v.originalValue,review:v.review})),effectiveAccent:receipt.preview.visualDirection.tokens.accent,verifiedFiles:receipt.files.length,fonts:receipt.fonts.map((f: {family:string})=>f.family),packshotSha256:sha(image),snapshotFalseFlagsPreserved:true,htmlReceiptAgreement:true,references:audit.checked});
}
console.log(JSON.stringify(results,null,2));
