/* eslint-disable @typescript-eslint/no-require-imports -- CJS tests exercise the pre-start CJS preload. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
test('offline boundaries refuse before synthetic underlying resolver/connector seams', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert=require('node:assert/strict');
    let calls=0; const seam=()=>{calls++; throw Error('UNDERLYING');};
    const dns=require('node:dns'), net=require('node:net'), http=require('node:http'), https=require('node:https'), tls=require('node:tls'), h2=require('node:http2');
    const udp=require('node:dgram'); udp.Socket.prototype.connect=seam; udp.Socket.prototype.send=seam;
    dns.Resolver.prototype.resolve4=seam; dns.promises.Resolver.prototype.resolve4=seam;
    dns.lookup=seam; dns.resolve4=seam; dns.promises.lookup=seam;
    net.Socket.prototype.connect=seam; http.request=seam; https.get=seam; tls.connect=seam; h2.connect=seam; global.fetch=seam;
    require(${JSON.stringify(resolve('scripts/support/offline-guard.cjs'))});
    if(process.platform==='win32') assert.throws(()=>net.connect('unqualified-pipe'),{code:'ORNIGAMI_OFFLINE'});
    const datagram=udp.createSocket('udp4');
    assert.throws(()=>datagram.connect(53,'203.0.113.1'),{code:'ORNIGAMI_OFFLINE'});
    assert.throws(()=>datagram.send('x',53,'203.0.113.1'),{code:'ORNIGAMI_OFFLINE'});
    datagram.close();
    assert.throws(()=>new dns.Resolver().resolve4('outside.invalid',()=>{}),{code:'ORNIGAMI_OFFLINE'});
    assert.throws(()=>new dns.promises.Resolver().resolve4('outside.invalid'),{code:'ORNIGAMI_OFFLINE'});
    for(const op of [()=>dns.lookup('outside.invalid',()=>{}),()=>dns.resolve4('outside.invalid',()=>{}),()=>dns.promises.lookup('outside.invalid'),()=>net.connect(443,'203.0.113.1'),()=>http.request('http://outside.invalid'),()=>https.get('https://outside.invalid'),()=>tls.connect(443,'outside.invalid'),()=>h2.connect('https://outside.invalid')]) assert.throws(op,{code:'ORNIGAMI_OFFLINE'});
    fetch('https://outside.invalid').then(()=>process.exitCode=1,e=>{assert.equal(e.code,'ORNIGAMI_OFFLINE');assert.equal(calls,0);});
  `], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(result.status, 0, result.stderr);
});
test('sanitized compilation child environment retains preload', () => {
  const guard = resolve('scripts/support/offline-guard.cjs');
  const result = spawnSync(process.execPath, ['-e', `
    const r=require('node:child_process').spawnSync(process.execPath,['-e',"try {require('node:dns').lookup('outside.invalid',()=>{});process.exit(2)} catch(e){process.exit(e.code==='ORNIGAMI_OFFLINE'?0:3)}"],{env:{SystemRoot:process.env.SystemRoot}}); process.exit(r.status??4);
  `], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--require=' + JSON.stringify(guard) } });
  assert.equal(result.status, 0, result.stderr);
});
test('local data fetch remains available without a network exception', () => {
  const result = spawnSync(process.execPath, ['-e', "fetch('data:text/plain,offline').then(r=>r.text()).then(t=>process.exit(t==='offline'?0:1))"], {
    encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--require=' + JSON.stringify(resolve('scripts/support/offline-guard.cjs')) },
  });
  assert.equal(result.status, 0, result.stderr);
});
