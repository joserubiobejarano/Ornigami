import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const productionBundles = ['app-page.runtime.prod.js', 'app-page-experimental.runtime.prod.js', 'app-page-turbo.runtime.prod.js', 'app-page-turbo-experimental.runtime.prod.js'];
export function checkPackage(directory) {
  return productionBundles.map(name => {
    const file = path.join(directory,'dist/compiled/next-server',name);
    const source = fs.readFileSync(file,'utf8');
    const imports = [...source.matchAll(/\brequire\(("(?:[^"\\]|\\.)*")\)/g)].map(m=>JSON.parse(m[1]));
    assert.ok(imports.length>0,`No literal external imports found: ${name}`);
    for(const specifier of imports) assert.ok(!specifier.includes('\\') && !/^[A-Za-z]:/.test(specifier),`Nonportable external in ${name}: ${specifier}`);
    assert.ok(imports.includes('next/dist/server/app-render/work-async-storage.external.js'),`Production external missing: ${name}`);
    const map=JSON.parse(fs.readFileSync(file+'.map','utf8'));
    assert.ok(map.sources.length>0 && map.sourcesContent?.length===map.sources.length,`Source map missing content: ${name}`);
    return {name,externalCount:imports.length,sourceMapSources:map.sources.length};
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkPackage(path.resolve(process.argv[2]))));
