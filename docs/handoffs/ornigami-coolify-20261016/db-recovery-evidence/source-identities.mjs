import fs from 'node:fs';import path from 'node:path';import{execFileSync,spawn}from'node:child_process';import{createHash}from'node:crypto';
const out=path.resolve('docs/handoffs/ornigami-coolify-20261016/db-recovery-evidence');
const source='5b1efb08d705985ed019a5eb7c3c70e5e7429303';
const git=(...args)=>execFileSync('git',args,{timeout:15000,maxBuffer:32*1024*1024,windowsHide:true});
const files=['.github/workflows/ornigami-db-admission-only.yml','.github/workflows/ornigami-image-rehearsal.yml','.github/build-requests/ornigami-db-admission.json','.github/build-requests/ornigami.json','package.json','package-lock.json','Dockerfile','scripts/framework-prototype/official-db-publication.mjs','scripts/framework-prototype/official-db-manifest.json','scripts/framework-prototype/admission-only.mjs','scripts/framework-prototype/admission-only-capture.py','scripts/framework-prototype/admission-only-bootstrap.sh','scripts/framework-prototype/admission-only-worker.mjs','scripts/framework-prototype/frozen-db-admission.mjs','scripts/framework-prototype/next-16.4.2-sri.patch','vendor/framework/next-16.4.2-ornigami-sri.2.tgz','vendor/build-tools/npm-11.21.1.tgz'];
const identities={sourceSha:source,tree:git('rev-parse',source+'^{tree}').toString().trim(),localBranch:git('branch','--show-current').toString().trim(),remotePublicationBaseline:'97fc2b86f2efe55683242e8b20a38a79fdebfb1e',files:{},publication:'not performed',request:'preview only',securityAcceptance:'HOLD; exact database coverage/internal freshness and full image acceptance untested'};
git('merge-base','--is-ancestor',identities.remotePublicationBaseline,source);
if(git('diff',identities.remotePublicationBaseline,source,'--','.github/build-requests').length)throw Error('Request markers changed');
for(const f of files){
 const blob=git('rev-parse',source+':'+f).toString().trim(),size=Number(git('cat-file','-s',blob).toString());
 if(size>128*1024*1024)throw Error('Source blob size bound exceeded');
 const child=spawn('git',['cat-file','blob',blob],{windowsHide:true,stdio:['ignore','pipe','pipe']}),h=createHash('sha256');let bytes=0;
 const timer=setTimeout(()=>child.kill(),15000);const completion=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Source stream failed')));});
 child.stderr.resume();for await(const chunk of child.stdout){bytes+=chunk.length;if(bytes>size){child.kill();throw Error('Source size drift');}h.update(chunk);}
 try{await completion;}finally{clearTimeout(timer);}if(bytes!==size)throw Error('Incomplete source stream');
 identities.files[f]={bytes,sha256:h.digest('hex'),gitBlob:blob};
}
if(identities.files['package-lock.json'].sha256!=='4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815')throw Error('Lock drift');
const lock=git('show',source+':package-lock.json');if(lock.includes(13))throw Error('Lock not LF');
fs.writeFileSync(path.join(out,'SOURCE_IDENTITIES.json'),JSON.stringify(identities,null,2)+'\n');
fs.writeFileSync(path.join(out,'REQUEST_PREVIEW.json'),JSON.stringify({purpose:'ornigami-db-admission-only-v1',sourceSha:source,packageLockSha256:identities.files['package-lock.json'].sha256},null,2)+'\n');
console.log(JSON.stringify({sourceSha:source,tree:identities.tree,files:files.length,markersUnchanged:true,committedLockIsLF:true}));
