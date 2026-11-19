// Offline specimens use the real React renderer and raw CSS-module local names.
// The ordinary browser approval/export journey is checked separately.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const root = process.cwd();
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/image') return { url: 'data:text/javascript,import image from "'+pathToFileURL(join(root,'node_modules/next/image.js')).href+'";export default image.default;', shortCircuit: true };
    if (specifier.startsWith('@/')) {
      const base = join(root, 'src', specifier.slice(2));
      const path = [base, base+'.ts', base+'.tsx', join(base,'index.ts')].find(p=>existsSync(p));
      if (!path) throw new Error(`Missing fixture module ${specifier}`);
      return next(pathToFileURL(path).href, context);
    }
    if (specifier.startsWith('.') && !extname(specifier) && context.parentURL?.startsWith(pathToFileURL(join(root,'src')).href)) {
      const base=fileURLToPath(new URL(specifier,context.parentURL));
      const path=[base+'.ts',base+'.tsx',base+'.js'].find(p=>existsSync(p));
      if(path)return next(pathToFileURL(path).href,context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.module.css')) {
      const css = readFileSync(fileURLToPath(url),'utf8');
      const names = [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>m[1]);
      return { format:'module', source:`export default ${JSON.stringify(Object.fromEntries(names.map(n=>[n,n])))};`, shortCircuit:true };
    }
    if (url.startsWith(pathToFileURL(root).href) && ['.tsx'].includes(extname(url))) {
      return {format:'module', source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    }
    return next(url, context);
  },
});
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { CampaignPage } = await import('../../src/components/campaign-lab/campaign-page.tsx');
const { frozenTypeCases } = await import('../../tests/fixtures/campaign-lab/offer-type.mts');
const phase = process.argv[2];
if (!['before','after'].includes(phase)) throw new Error('Specify before or after');
const out = resolve('.local/typography', phase);
mkdirSync(out,{recursive:true});
const css = readFileSync('src/components/campaign-lab/campaign-page.module.css','utf8');
const fontOut = resolve('public/fonts');
const fontCss = readFileSync('src/app/local-fonts.css','utf8');
const cases = frozenTypeCases();
const stress = [
  ['long', 'Rose Supply hand-glazed ceramic travel cup with matching lid and insulated sleeve'],
  ['identifier','ROSESUPPLYCERAMICCUPSERIES2026LIMITEDPRODUCTIONIDENTIFIER'],
  ['nbsp','Rose\u00a0Supply ceramic\u00a0cup'],
];
for (const [id,name] of stress) for(const original of cases.filter(c=>c.id==='rose')) {
  const copy=structuredClone(original);copy.id=id;copy.preview.brief.productName=name;copy.preview.draft.headline=name;cases.push(copy);
}
const inventory=[];
for (const { id, directionId, preview } of cases) {
  const name=`${id}-${directionId}`;
  const props={...preview,asset:{...preview.asset},headingId:'offer-title',imageRevision:preview.revision,imageStatus:'loaded',imageAttempt:0,onImageStateChange:()=>{}};
  if (props.asset.src.startsWith('/')) {
    const path=join(root,'public',props.asset.src); const dest=join(out,props.asset.src);mkdirSync(dirname(dest),{recursive:true});copyFileSync(path,dest);
  }
  const article=renderToStaticMarkup(createElement(CampaignPage,props));
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} ${phase}</title><style>${fontCss}\nhtml{font-size:16px}body{margin:0;--font-sans:Inter,Arial,sans-serif}main{width:var(--specimen-width,100%);max-width:100%;margin-inline:auto}${css}</style><main>${article}</main></html>`;
  writeFileSync(join(out,name+'.html'),html);
  // Pane specimens preserve viewport and independently constrain the article.
  for(const width of [600,909]) writeFileSync(join(out,name+`-pane${width}.html`),html.replace('<main>','<main style="--specimen-width:'+width+'px">'));
  inventory.push({id,directionId,brief:preview.brief,draft:preview.draft,asset:preview.asset,theme:preview.theme,revision:preview.revision});
}
writeFileSync(join(out,'frozen.json'),JSON.stringify(inventory,null,2));
console.log(`Rendered ${inventory.length} frozen/stress specimens for ${phase}; fonts=${readdirSync(fontOut).length-1}.`);
