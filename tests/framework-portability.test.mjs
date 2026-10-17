import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { checkPackage, productionBundles } from '../scripts/framework-prototype/check-package-portability.mjs';

const configuration = fs.readFileSync(new URL('../scripts/framework-prototype/overlay/next-runtime.webpack-config.js.source',import.meta.url),'utf8');
const require=createRequire(import.meta.url);
class Plugin {}
for(const platform of ['win32','posix']) {
  const paths=path[platform];
  const root=platform==='win32'?'C:\\source\\packages\\next':'/source/packages/next';
  function handler(bundleType='app') {
    const module={exports:{}};
    vm.runInNewContext(configuration,{module,__dirname:root,process:{env:{}},require(name){
      if(name==='path')return paths;
      if(name==='@rspack/core')return {SwcJsMinimizerRspackPlugin:Plugin,DefinePlugin:Plugin};
      if(name==='webpack-bundle-analyzer')return {BundleAnalyzerPlugin:Plugin};
      if(name==='./webpack-plugins/devtools-ignore-list-plugin')return Plugin;
      throw new Error(`Unexpected build dependency: ${name}`);
    }});
    return module.exports({dev:false,turbo:false,bundleType,experimental:false}).externals.at(-1);
  }
  for(const item of [
    {name:'production external',request:'./work-async-storage.external.js',resolved:['dist','esm','server','app-render','work-async-storage.external.js'],expected:'next/dist/server/app-render/work-async-storage.external.js'},
    {name:'worker SWC external',bundle:'app-worker',request:'../build/swc/install-bindings.js',resolved:['dist','esm','build','swc','install-bindings.js'],expected:'next/dist/build/swc/install-bindings.js'},
    {name:'compiled dependency',request:platform==='win32'?'next\\dist\\compiled\\semver':'next/dist/compiled/semver',expected:'next/dist/compiled/semver'},
    {name:'server dependency',request:'next/dist/server/image-optimizer',expected:'next/dist/server/image-optimizer'},
  ])test(`${platform}: actual source external handler emits portable ${item.name}`,async()=>{
    const result=await new Promise((resolve,reject)=>handler(item.bundle)({context:root,request:item.request,getResolve:()=>async()=>paths.join(root,...item.resolved??[])},(error,value)=>error?reject(error):resolve(value)));
    assert.equal(result,'commonjs '+item.expected);
  });
}
test('package admission checks all four bundles/maps and rejects a Windows external',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-portable-'));
  const dir=path.join(temp,'dist/compiled/next-server');fs.mkdirSync(dir,{recursive:true});
  try {
    for(const name of productionBundles){fs.writeFileSync(path.join(dir,name),'require("next/dist/server/app-render/work-async-storage.external.js")');fs.writeFileSync(path.join(dir,name+'.map'),JSON.stringify({sources:['source.js'],sourcesContent:['source']}));}
    assert.equal(checkPackage(temp).length,4);
    fs.appendFileSync(path.join(dir,productionBundles[3]),';require('+JSON.stringify('next\\dist\\server\\bad.js')+')');
    assert.throws(()=>checkPackage(temp),/Nonportable external/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('AST audit of cold-installed production bundles rejects either quote style for nonportable imports',()=>{
  const {parse}=require('next/dist/compiled/acorn');
  function audit(source){
    const stack=[parse(source,{ecmaVersion:'latest'})];let count=0;
    while(stack.length){
      const node=stack.pop();
      if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name==='require'&&node.arguments[0]?.type==='Literal'&&typeof node.arguments[0].value==='string'){
        count++;const value=node.arguments[0].value;
        assert.ok(!value.includes('\\')&&!/^[A-Za-z]:/.test(value),`Nonportable AST import: ${value}`);
      }
      for(const value of Object.values(node))if(Array.isArray(value))stack.push(...value.filter(x=>x&&typeof x==='object'));else if(value&&typeof value==='object')stack.push(value);
    }
    return count;
  }
  assert.throws(()=>audit('require("next\\\\dist")'),/Nonportable AST import/);
  assert.throws(()=>audit("require('next\\\\dist')"),/Nonportable AST import/);
  const directory=path.dirname(require.resolve('next/package.json'));
  for(const name of productionBundles)assert.ok(audit(fs.readFileSync(path.join(directory,'dist/compiled/next-server',name),'utf8'))>0);
});
