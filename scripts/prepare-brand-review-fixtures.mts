import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { collectBrandKitDraft } from "../src/lib/campaign-lab/brand-import/brand-evidence.ts";
import { parseBrandEvidence } from "../src/lib/campaign-lab/brand-review.ts";
const dir=new URL('../docs/examples/brand-review/',import.meta.url);
for (const [id,name,product,accent,page,surface,offer,facts] of [
 ["rose","Rose Supply","Rose Supply ceramic cup","#6b2340","#fff8fa","#f5e6ea","Cup + lid, €24 · offer ends 30 November 2026",[{label:"Capacity",value:"350 ml"},{label:"Material",value:"Glazed ceramic"}]],
 ["fjord","Fjord Works","Fjord Works field notebook","#163f64","#f5f9ff","#e5effb","Two notebooks for €18, through 2 December 2026",[{label:"Pages",value:"96 ruled pages"},{label:"Format",value:"A5, stitched binding"}]]
]) {
 await mkdir(new URL(id+'/',dir),{recursive:true});
 const html=`<title>Unapproved source copy &lt;script&gt;never execute&lt;/script&gt;</title><style>body{background:${page};color:#1f2a24}.card{background:${surface}}button{background:${accent}}.overlay{background:#12345680}${id==='fjord'?'@media (prefers-color-scheme:dark){.unknown{color:var(--missing)}}':''}</style><p>Untrusted marketing claim — not approved campaign facts.</p>`;
 const png=await sharp(Buffer.from(`<svg width="600" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="700" fill="${page}"/><rect x="145" y="130" width="310" height="420" rx="${id==='rose'?55:8}" fill="${accent}"/><rect x="175" y="180" width="250" height="240" rx="4" fill="${surface}"/><text x="300" y="290" text-anchor="middle" font-family="sans-serif" font-size="28" fill="${accent}">${name}</text><text x="300" y="340" text-anchor="middle" font-family="sans-serif" font-size="18" fill="${accent}">SYNTHETIC FIXTURE</text></svg>`)).png().toBuffer();
 const resources: import("../src/lib/campaign-lab/brand-import/evidence-types.ts").SuppliedBrandResource[]=[{kind:'html',requestedUrl:`https://${id}.example/home`,finalUrl:`https://${id}.example/home`,status:200,contentType:'text/html',body:Buffer.from(html)},{kind:'raster',requestedUrl:`https://${id}.example/photo.png`,finalUrl:`https://${id}.example/photo.png`,status:200,contentType:'image/png',body:png}];
 if(id==='fjord')resources.push({kind:'raster',requestedUrl:'https://fjord.example/logo.svg',finalUrl:'https://fjord.example/logo.svg',status:200,contentType:'image/svg+xml',body:Buffer.from('<svg/>')});
 const draft=await collectBrandKitDraft(resources);
 parseBrandEvidence(JSON.stringify(draft));
 await writeFile(new URL(`${id}/evidence.json`,dir),JSON.stringify(draft,null,2)+'\n');
 await writeFile(new URL(`${id}/source.html`,dir),html);
 await writeFile(new URL(`${id}/packshot.png`,dir),png);
 await writeFile(new URL(`${id}/brief.json`,dir),JSON.stringify({schemaVersion:1,brandName:name,productName:product,audience:id==='rose'?'Home coffee drinkers':'Field researchers',objective:'Present the exact bundle and purchase destination',offer,destinationUrl:`https://${id}.example/products/${id}`,facts,alt:`Synthetic ${product} packshot`,rights:'Synthetic fixture created locally; approved for this local test.'},null,2)+'\n');
 console.log(id,draft.outcome,draft.sources.map(s=>s.outcome),draft.candidates.length);
}
