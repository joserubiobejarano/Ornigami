// Schema fixtures only. No live-body replay, URL reads or raster decoding.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseBrandEvidence } from '../../src/lib/campaign-lab/brand-review.ts';
import type { BrandKitDraft, EvidenceCandidate } from '../../src/lib/campaign-lab/brand-import/evidence-types.ts';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const base = parseBrandEvidence(readFileSync(new URL('../../docs/examples/brand-review/rose/evidence.json', import.meta.url), 'utf8'));
const colors = ['#6b2340ff','#fff8faff','#f5e6eaff','#ffffffff','#123456ff','#888888ff','#12345680','#fff8f9ff',
  '#163f64ff','#009978ff','#e6efffff','#efd160ff','#8c56a0ff','#171813ff','#f5f9ffff','#d86c30ff',
  '#a4b0b8ff','#2e6c5aff','#f4eedaff','#db91a7ff','#4168a0ff','#dce6ddff','#f7fafaff',
  base.candidates.find(c=>c.category==='raster-color')!.observed];
const large: BrandKitDraft = { ...base, sources: [], candidates: [], gaps: [
  'SYNTHETIC PALETTE USABILITY FIXTURE. Not IANA evidence or a replay of live bodies.',
  'Literal colors only; themes, cascade and computed applicability remain unresolved. Ownership, campaign facts and media rights are not approved.'
] };
for (const [index, name] of ['base','dark-theme','conditional'].entries()) {
  const values = Array.from({length:40}, (_,i)=>colors[i%colors.length]);
  const declarations = values.map((value,i)=>`.sample-${i}{color:${value}}`);
  const body = (index ? `/* ${name}: applicability unresolved */\n` : '') + declarations.join('\n');
  const url = `https://palette.synthetic.invalid/${name}.css`;
  const source = {id:hash(url),kind:'css' as const,requestedUrl:url,finalUrl:url,status:200,contentType:'text/css',byteLength:Buffer.byteLength(body),sha256:hash(body),outcome:'processed' as const,issues:index ? ['conditional-or-multiple-theme-evidence-unresolved'] : []};
  large.sources.push(source);
  let at = 0;
  values.forEach((observed,i)=>{
    const offset = body.indexOf(observed,at); at = offset + observed.length;
    const candidate: EvidenceCandidate = {id:hash(`${source.id}:${i}`),sourceId:source.id,sourceSha256:source.sha256,
      method:'css-declaration',category:'ui-color',observed,evidence:{quote:observed,utf16Offset:offset},
      details:{property:'color',alpha:parseInt(observed.slice(7),16)/255},
      roleHint:{value:index ? 'conditional' : 'ink',reason:'Synthetic declaration context; this is not an approved brand role.'},
      confidence:{level:'medium',reason:'Synthetic literal declaration; visibility and role unresolved.',calibrated:false},
      uncertainty:[`Synthetic ${name} observation.`,...(index ? ['Theme or conditional applicability unresolved.'] : []),'Presence and repetition do not establish ownership or a brand role.'],reviewStatus:'unreviewed'};
    large.candidates.push(candidate);
  });
}
const photoSources = base.sources.filter(s=>s.kind==='raster');
large.sources.push(...photoSources);
large.candidates.push(...base.candidates.filter(c=>c.category==='raster-color'));
const small: BrandKitDraft = {...base,sources:base.sources.filter(s=>s.kind==='html'),candidates:base.candidates.filter(c=>c.category==='ui-color' && ['#6b2340ff','#fff8faff','#f5e6eaff'].includes(c.observed)),gaps:['SYNTHETIC small clean palette fixture; no source/ownership approval.']};
const empty: BrandKitDraft = {...small,outcome:'incomplete',candidates:[],gaps:['SYNTHETIC insufficient evidence: no supported color observations. Keep manual or direction defaults.']};
const directory = new URL('../fixtures/palette-review/',import.meta.url);
mkdirSync(directory,{recursive:true});
for(const [name,draft] of Object.entries({large,small,empty})) {
  parseBrandEvidence(JSON.stringify(draft));
  writeFileSync(new URL(`${name}.json`,directory),JSON.stringify(draft,null,2)+'\n');
}
