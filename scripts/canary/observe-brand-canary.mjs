/** Trusted passive diagnostics. No HTTP/DNS/TLS implementation is replaced. */
import { channel } from 'node:diagnostics_channel';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
/** Suppress framework update/telemetry fetches; protected Node HTTP reader is untouched. */
export function guardBackgroundFetch(original=globalThis.fetch,onBlocked=()=>{}) {
  globalThis.fetch=(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL ? input : input.url);
    if(!local(url.hostname)){onBlocked(url.hostname);return Promise.reject(new TypeError('Canary permits only local global-fetch requests; source work must use the protected reader.'));}
    return original(input,init);
  };
  return ()=>{globalThis.fetch=original;};
}
export function observeCanary(directory) {
  mkdirSync(directory, {recursive:true,mode:0o700});
  let sources=0;
  const subscriptions=[];
  const emit = (type, data={}) => appendFileSync(join(directory,`events-${process.pid}.jsonl`), JSON.stringify({type,pid:process.pid,at:new Date().toISOString(),monotonic:performance.now(),...data})+'\n',{mode:0o600});
  const subscribe=(name, fn)=>{channel(name).subscribe(fn);subscriptions.push([name,fn]);};
  const apiPath='/api/campaign-lab/brand-evidence';
  subscribe('http.server.request.start', ({request})=>{
    if(request.method==='POST' && [apiPath,'/api/campaign-lab/generate'].includes(request.url?.split('?')[0]))emit('local-request',{method:request.method,path:request.url.split('?')[0],sourceAttemptsSoFar:sources});
  });
  subscribe('http.server.response.finish', ({request,response})=>{
    if(request.method==='POST' && [apiPath,'/api/campaign-lab/generate'].includes(request.url?.split('?')[0]))emit('local-response',{path:request.url.split('?')[0],status:response.statusCode,sourceAttemptsSoFar:sources});
  });
  subscribe('http.client.request.start', ({request})=>{
    const host=String(request.getHeader('host')??'');
    const protocol=request.protocol ?? request.agent?.protocol ?? 'https:';
    let url;try{url=new URL(request.path,`${protocol}//${host}`);}catch{return;}
    if(local(url.hostname))return;
    const index=sources++;
    const key=`${process.pid}-${index}`;
    emit('source-request',{index,key,url:url.href,method:request.method});
    request.once('error',error=>emit('source-error',{key,code:error.code??'REQUEST_ERROR'}));
    request.once('response', response=>{
      const meta={key,status:response.statusCode,contentType:response.headers['content-type']??null,location:response.headers.location??null,encoding:response.headers['content-encoding']??null};
      emit('source-headers',meta);
      // Redirect entities are destroyed unread by the reader. Do not attach a body listener.
      if([301,302,303,307,308].includes(response.statusCode))return;
      const hash=createHash('sha256');const chunks=[];let bytes=0;let ended=false;
      response.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);if(bytes<=1024*1024)chunks.push(Buffer.from(chunk));});
      response.once('end',()=>{
        ended=true;
        const file=`body-${key}.bin`;
        if(bytes<=1024*1024)writeFileSync(join(directory,file),Buffer.concat(chunks),{mode:0o600});
        emit('source-body',{key,bytes,sha256:hash.digest('hex'),file:bytes<=1024*1024?file:null,complete:response.complete});
      });
      response.once('close',()=>{if(!ended)emit('source-body-interrupted',{key,observedBytes:bytes});});
    });
    const socket=request.socket;
    if(socket){
      const connected=()=>emit('connection',{key,remoteAddress:socket.remoteAddress,remotePort:socket.remotePort,remoteFamily:socket.remoteFamily});
      if(socket.connecting)socket.once('connect',connected);else connected();
      const secure=()=>{
        const cert=socket.getPeerCertificate?.();
        emit('tls',{key,authorized:socket.authorized,servername:socket.servername??null,protocol:socket.getProtocol?.(),alpn:socket.alpnProtocol,certificateSha256:cert?.fingerprint256});
      };
      if(socket.encrypted && !socket.secureConnecting)secure();else if(socket.encrypted)socket.once('secureConnect',secure);
      socket.once('close',hadError=>emit('connection-close',{key,hadError}));
    }
  });
  emit('observer-start',{node:process.version,openssl:process.versions.openssl});
  return ()=>{for(const [name,fn] of subscriptions)channel(name).unsubscribe(fn);emit('observer-stop',{sourceAttempts:sources});};
}

if(process.env.ORNIGAMI_CANARY_AUDIT_DIR){
  const directory=process.env.ORNIGAMI_CANARY_AUDIT_DIR;
  if(!existsSync(join(directory,'EXECUTION_RESERVED')))throw new Error('Canary reservation missing; no server should start.');
  observeCanary(directory);
  guardBackgroundFetch(undefined,host=>appendFileSync(join(directory,`events-${process.pid}.jsonl`),JSON.stringify({type:'blocked-background-fetch',host,pid:process.pid,at:new Date().toISOString(),monotonic:performance.now()})+'\n'));
}
else if(process.env.ORNIGAMI_CANARY_OFFLINE_GUARD==='true')guardBackgroundFetch();
