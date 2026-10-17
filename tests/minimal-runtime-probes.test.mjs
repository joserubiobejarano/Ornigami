import test from'node:test';import assert from'node:assert/strict';import{cgroupSnapshot,cgroupKeys,identity,diskUsage,imageFormats,runtimePlatform}from'../deploy/coolify/runtime-probes.mjs';
test('shell-free cgroup probe preserves every metric and rejects missing/empty counters',()=>{
  const text=cgroupSnapshot(key=>'fixture-'+key);for(const key of cgroupKeys)assert.ok(text.includes('=='+key+'==\nfixture-'+key+'\n'));
  assert.throws(()=>cgroupSnapshot(key=>key==='memory.events'?'':'1'),/Empty required/);
  assert.throws(()=>cgroupSnapshot(()=>{throw Error('EACCES');}),/EACCES/);
});
test('UID and GID must both equal the existing non-root 1000 contract',()=>{
  assert.equal(identity({uid:1000,gid:1000}),'1000');for(const input of [{uid:0,gid:0},{uid:65532,gid:65532},{uid:1000,gid:0}])assert.throws(()=>identity(input),/UID\/GID/);
});
test('shell-free disk probe reports exact bigint bytes for root/tmp/cache',()=>{
  const seen=[],rows=diskUsage(p=>{seen.push(p);return{bsize:4096n,blocks:9007199254740993n,bfree:10n,bavail:9n};});assert.deepEqual(seen,['/','/tmp','/app/.next/cache']);assert.equal(rows[0].totalBytes,'36893488147419107328');assert.equal(rows[1].availableBytes,'36864');
});
function fakeSharp({unsupported,wrongSize,wrongAvif}={}){
  const sharp=()=>{const api={toFormat:()=>api,resize:()=>api,webp:()=>api,png:()=>api,metadata:async()=>({format:'heif',compression:wrongAvif?'hevc':'av1'}),toBuffer:async options=>options?{data:Buffer.from('fictional-pixels'),info:{width:wrongSize?8:4,height:4,format:currentFormat}}:Buffer.from('fictional-image')};let currentFormat='webp';api.png=()=>{currentFormat='png';return api;};return api;};
  sharp.format=Object.fromEntries(['png','jpeg','webp','avif','gif','tiff'].map(format=>[format==='avif'?'heif':format,{input:{buffer:format!==unsupported},output:{buffer:true,alias:format==='avif'?['avif']:[]}}]));sharp.versions={sharp:'fictional'};return sharp;
}
test('all supported codec paths must encode/decode/resize, including SVG input',async()=>{const result=await imageFormats(fakeSharp());assert.equal(result.result,'passed');assert.deepEqual(result.checks.map(x=>x.format),['png','jpeg','webp','avif','gif','tiff','svg-input']);});
test('missing codec support and wrong transformed dimensions cannot pass',async()=>{await assert.rejects(imageFormats(fakeSharp({unsupported:'avif'})),/unavailable: avif/);await assert.rejects(imageFormats(fakeSharp({wrongSize:true})),/Image transform failed/);});
test('AVIF assertion requires actual AV1 metadata rather than any HEIF payload',async()=>{await assert.rejects(imageFormats(fakeSharp({wrongAvif:true})),/AV1 in HEIF/);});
test('runtime platform cannot silently switch Node/OpenSSL/libc or omit required CPU features',()=>{const valid={platform:'linux',arch:'x64',node:'v22.23.3',openssl:'3.5.8',glibc:'2.41',flags:'sse4_2 avx'};assert.equal(runtimePlatform(valid).sse4_2,true);for(const changed of [{node:'v22.24.0'},{openssl:'3.6.0'},{glibc:null},{flags:'sse2'}])assert.throws(()=>runtimePlatform({...valid,...changed}),/Unreviewed/);});
