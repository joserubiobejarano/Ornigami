import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { analyzeScriptTags, parseCspNonce, scriptTags } from '../sri-production-check.mjs';
const [fixtureArg, upstreamArg, outputArg] = process.argv.slice(2);
assert.ok(outputArg, 'Usage: browser-regressions.mjs FIXTURE UPSTREAM OUTPUT');
const fixture = path.resolve(fixtureArg), output = path.resolve(outputArg);
fs.mkdirSync(output,{recursive:true});
const require = createRequire(path.resolve(upstreamArg,'package.json'));
const { chromium } = require('playwright');
const report = {checks:[], http:[], console:[], insertion:[], forbiddenRequests:[], cleanup:false};
const save = () => fs.writeFileSync(path.join(output,'regressions.json'),JSON.stringify(report,null,2)+'\n');
const check = async (name, fn) => {
  try { const evidence = await fn(); report.checks.push({name,state:'passed',evidence}); }
  catch (error) { report.checks.push({name,state:'failed',assertion:error.message,stack:error.stack}); }
  save();
};
let server, browser, origin;
let logs = '';
async function start(expectedStatus = 200) {
  const reservation = createServer();
  await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port = reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath,[path.join(fixture,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:fixture,env:{...process.env,NODE_ENV:'production'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  for (const stream of [server.stdout,server.stderr]) stream.on('data',bytes=>{ logs += bytes.toString(); fs.writeFileSync(path.join(output,'server.log'),logs); });
  for (let i=0;i<120;i++) {
    if (server.exitCode !== null) throw new Error(`Production server exited ${server.exitCode}`);
    try { if ((await fetch(origin)).status===expectedStatus) return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Production server readiness timeout');
}
async function stop() {
  if (server && server.exitCode===null && server.signalCode===null) {
    const exited = new Promise(resolve=>server.once('exit',resolve));
    server.kill(); await exited;
  }
}
async function context() {
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : (report.forbiddenRequests.push(new URL(route.request().url()).origin),route.abort()));
  await context.addInitScript(() => {
    globalThis.__ORNIGAMI_INSERTIONS__=[];
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild=function(child) {
      if (child.tagName==='SCRIPT' && child.src) globalThis.__ORNIGAMI_INSERTIONS__.push({src:new URL(child.src).pathname,integrity:child.integrity,nonce:child.nonce,crossOrigin:child.crossOrigin});
      return append.call(this,child);
    };
  });
  return context;
}
function observe(page) { page.on('console',message=>report.console.push({type:message.type(),text:message.text().slice(0,2000)})); }
async function assertSriRejection(page) {
  assert.equal(await page.evaluate(()=>globalThis.__ORNIGAMI_CORRUPTED_EXECUTED__),undefined,'Corrupted script marker must never execute');
  assert.ok(report.console.some(line=>/integrity|digest/i.test(line.text) && /fail|invalid|block|match/i.test(line.text)),'Browser must report an integrity/digest rejection');
}
try {
  await start();
  await check('production-http-sri-and-csp',async()=>{
    const nonces=[];
    for (const [route,headers,expected] of [['/',{},200],['/other',{},200],['/absent',{},404],['/fail',{},200],['/slow',{},200],['/',{'x-prototype-fail':'layout'},500]]) {
      const response=await fetch(origin+route,{headers});
      const html=await response.text();
      const csp=response.headers.get('content-security-policy');
      const snapshot={route,status:response.status,expected,headers:{'content-security-policy':csp,'x-content-type-options':response.headers.get('x-content-type-options')},body:html.slice(0,24000)};
      report.http.push(snapshot); save();
      assert.equal(response.status,expected,`HTTP ${route} status`);
      assert.equal(parseCspNonce(csp??'').error,null,`Strict nonce CSP ${route}`);
      nonces.push(parseCspNonce(csp).nonce);
      const coverage=await analyzeScriptTags(html,origin+route,async url=>new Uint8Array(await (await fetch(url)).arrayBuffer()));
      snapshot.coverage=coverage; save();
      assert.deepEqual(coverage.issues,[],`All script SRI digests must match on ${route}`);
      assert.ok(coverage.sameOriginCount>0,`Must inspect real scripts on ${route}`);
    }
    assert.equal(new Set(nonces).size,nonces.length,'Nonce must rotate across responses');
    return {routes:report.http.length};
  });
  const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  assert.ok(executable,'Installed isolated browser required; no external download fallback');
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-background-networking']});
  report.browserVersion=browser.version();
  let lateAsset;
  await check('valid-hydration-late-loading-and-navigation',async()=>{
    const ctx=await context();
    try {
      const page=await ctx.newPage(); observe(page);
      await page.goto(origin);
      await page.getByRole('button',{name:'Load late chunk'}).click();
      await page.locator('#late-result').filter({hasText:'late-loaded'}).waitFor();
      assert.equal(await page.evaluate(()=>globalThis.__ORNIGAMI_VALID_LATE__),true);
      const inserted=await page.evaluate(()=>globalThis.__ORNIGAMI_INSERTIONS__);
      report.insertion.push(...inserted);
      lateAsset=inserted.at(-1)?.src;report.lateAsset=lateAsset;save();
      assert.ok(inserted.length>0,'Must exercise asynchronous script insertion');
      for (const script of inserted) {
        assert.match(script.integrity,/^sha256-[A-Za-z0-9+/]{43}=$/,'SRI before append');
        assert.ok(script.nonce,'Nonce retained before append');
        assert.equal(script.crossOrigin,'anonymous');
      }
      await page.getByRole('link',{name:'Other route'}).click();
      await page.locator('#other-route').waitFor();
      return {inserted,clientNavigation:true};
    } finally { await ctx.close(); }
  });
  await check('corrupted-bootstrap-rejected',async()=>{
    const ctx=await context();
    try {
      const html=await (await fetch(origin)).text();
      const bootstrap=scriptTags(html).find(tag=>/\/webpack-/.test(tag.attributes.get('src')??''));
      assert.ok(bootstrap,'Must identify actual webpack bootstrap');
      const target=new URL(bootstrap.attributes.get('src'),origin).pathname;
      let intercepted=0; const consoleStart=report.console.length;
      await ctx.route('**/*',route=>{
        const url=new URL(route.request().url());
        if (url.origin!==origin) return route.abort();
        if (url.pathname===target) {intercepted++;return route.fulfill({status:200,contentType:'application/javascript',body:'globalThis.__ORNIGAMI_CORRUPTED_EXECUTED__=true;'});}
        return route.continue();
      });
      const page=await ctx.newPage();observe(page);await page.goto(origin);await page.waitForTimeout(500);
      assert.ok(intercepted>0,'Corrupted bootstrap must actually be requested');
      await assertSriRejection(page);
      assert.ok(report.console.slice(consoleStart).some(line=>/integrity|digest/i.test(line.text)),'Current case must report SRI failure');
      return {target,intercepted,status:200,corruptionMarkerExecuted:false};
    } finally {await ctx.close();}
  });
  await check('corrupted-asynchronous-chunk-rejected',async()=>{
    assert.ok(lateAsset,'Valid late-load case must identify exact asset first');
    const ctx=await context();
    try {
      let intercepted=0;const consoleStart=report.console.length;
      await ctx.route('**/*',route=>{
        const url=new URL(route.request().url());
        if (url.origin!==origin) return route.abort();
        if(url.pathname===lateAsset){intercepted++;return route.fulfill({status:200,contentType:'application/javascript',body:'globalThis.__ORNIGAMI_CORRUPTED_EXECUTED__=true;'});}
        return route.continue();
      });
      const page=await ctx.newPage();observe(page);await page.goto(origin);
      await page.getByRole('button',{name:'Load late chunk'}).click();
      await page.locator('#late-result').filter({hasText:'rejected'}).waitFor();
      assert.ok(intercepted>0,'Corrupt asynchronous asset must actually be requested');
      await assertSriRejection(page);
      assert.equal(await page.evaluate(()=>globalThis.__ORNIGAMI_VALID_LATE__),undefined);
      assert.ok(report.console.slice(consoleStart).some(line=>/integrity|digest/i.test(line.text)));
      return {target:lateAsset,intercepted,status:200,corruptionMarkerExecuted:false};
    } finally {await ctx.close();}
  });
  await check('missing-and-malformed-manifest-entry-fail-closed',async()=>{
    const appRequire=createRequire(path.join(fixture,'package.json'));
    const {scriptIntegrity}=appRequire('next/dist/server/app-render/script-integrity');
    assert.throws(()=>scriptIntegrity({},'static/chunks/example.js'),/missing or malformed/);
    assert.throws(()=>scriptIntegrity({'static/chunks/example.js':'sha256-wrong'},'static/chunks/example.js'),/missing or malformed/);
    assert.equal(scriptIntegrity(undefined,'development.js'),undefined,'Explicit non-SRI mode');
    return {missingEntryRejected:true,malformedEntryRejected:true};
  });
  await check('browser-missing-chunk-hash-fail-closed-before-request',async()=>{
    const ctx=await context();
    try {
      const page=await ctx.newPage();await page.goto(origin);
      const dropped=await page.evaluate(()=>{
        let count=0;
        globalThis.webpackChunk_N_E.push([[987654321],{},require=>{
          for(const key of Object.keys(require.ornigamiSri)){delete require.ornigamiSri[key];count++;}
        }]);
        return count;
      });
      assert.ok(dropped>0,'Exercise the actual webpack SRI map');
      let requests=0;
      page.on('request',request=>{if(new URL(request.url()).pathname===lateAsset)requests++;});
      await page.getByRole('button',{name:'Load late chunk'}).click();
      await page.locator('#late-result').filter({hasText:'rejected'}).waitFor();
      assert.equal(requests,0,'Missing integrity must reject before requesting late script');
      assert.equal(await page.evaluate(()=>globalThis.__ORNIGAMI_VALID_LATE__),undefined);
      return {dropped,lateRequests:requests};
    } finally {await ctx.close();}
  });
  await check('independent-local-restart-and-generated-cache-marker',async()=>{
    const cache = path.join(fixture,'.next/cache');fs.mkdirSync(cache,{recursive:true});
    const marker = path.join(cache,'ornigami-fictional-restart-marker');fs.writeFileSync(marker,'fictional-cache-marker');
    await stop();await start();
    assert.equal(fs.readFileSync(marker,'utf8'),'fictional-cache-marker');
    const response = await fetch(origin);
    assert.equal(response.status,200);
    const coverage=await analyzeScriptTags(await response.text(),origin,async url=>new Uint8Array(await(await fetch(url)).arrayBuffer()));
    assert.deepEqual(coverage.issues,[],'Restart must retain valid emitted SRI');
    return {processRestart:true,cacheMarkerRetained:true,containerRecreation:'untested',actualCacheReuse:'untested'};
  });
  await check('production-missing-manifest-fail-closed',async()=>{
    await stop();
    const file=path.join(fixture,'.next/server/subresource-integrity-manifest.json');
    const bytes=fs.readFileSync(file);
    fs.renameSync(file,file+'.held');
    try {
      await start(500);
      const response = await fetch(origin);
      assert.equal(response.status,500,'Missing SRI manifest must fail HTTP');
      report.http.push({route:'/',case:'missing-manifest',status:response.status,body:(await response.text()).slice(0,24000)});save();
      assert.match(logs,/SRI: enabled production build has no integrity manifest/);
    } finally {
      await stop(); fs.writeFileSync(file,bytes);fs.unlinkSync(file+'.held');
    }
    return {missingManifestRejected:true};
  });
} catch(error) { report.checks.push({name:'harness-prerequisite',state:'failed',assertion:error.message,stack:error.stack}); }
finally {
  // Persist assertion/status/body/log evidence before cleanup, including failures.
  report.serverExitCode=server?.exitCode;save();
  try {if(browser)await browser.close();await stop();report.cleanup=true;} finally {save();}
}
process.exitCode=report.checks.some(c=>c.state==='failed')?1:0;
