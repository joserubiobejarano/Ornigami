import fs from'node:fs';import path from'node:path';import{spawnSync,spawn}from'node:child_process';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{requiredStages}from'./scan-image-stages.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const save=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n');
export function aggregate(records,sourceSha){return{schema:1,...(sourceSha?{sourceSha}:{}),expectedStages:requiredStages,stages:requiredStages.map(stage=>records.find(x=>x.stage===stage)??{stage,result:'skipped',reason:'phase did not produce a receipt'}),result:requiredStages.every(s=>records.some(x=>x.stage===s&&x.result==='passed'))?'passed':'failed'};}
export function rejectReexecution(event){return(event.vertexes??[event]).some(v=>/\bRUN\b/.test(v.name??'')&&(v.started||v.completed)&&v.cached!==true);}
export function cachedTargetRun(event,target){return(event.vertexes??[event]).some(v=>v.name?.startsWith('['+target+' ')&&/\bRUN\b/.test(v.name)&&v.cached===true);}
export function remainingSeconds(deadline){const n=Math.floor(Number(deadline)-Date.now()/1000);if(!Number.isFinite(n)||n<1)throw Error('Work deadline exhausted/invalid; no retry');return n;}
export function validateBuilderObservation(last){if(!last?.final||last.exit!==0)throw Error('Final owned-builder observation unavailable');for(const[key,value]of[['memory.max','8589934592'],['memory.swap.max','0'],['cpu.max','300000 100000']])if(!last.metrics.includes('=='+key+'==\n'+value+'\n'))throw Error('Observed builder limit drift');const events=last.metrics.match(/==memory.events==\n([\s\S]*?)(?=\n==)/)?.[1];if(!events||['oom','oom_kill','oom_group_kill'].some(k=>!events.split('\n').includes(k+' 0')))throw Error('Builder OOM/kill counters nonzero or unavailable');return true;}
async function fileHash(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function main(){
  const mode=process.argv[2];if(!['parents','final','intermediates','aggregate','cleanup'].includes(mode))throw Error('Expected parents/final/intermediates/aggregate/cleanup');
  const temp=process.env.RUNNER_TEMP,source=process.env.SOURCE_SHA,evidence=process.env.ORNIGAMI_EVIDENCE_DIR;if(!temp||!evidence||!/^[0-9a-f]{40}$/.test(source??''))throw Error('Admitted source/workspace required');
  const root=path.join(evidence,'stage-scans');fs.mkdirSync(root,{recursive:true});
  const records=()=>requiredStages.flatMap(stage=>{const file=path.join(root,stage,'driver.json');return fs.existsSync(file)?[JSON.parse(fs.readFileSync(file))]:[];});
  if(mode==='cleanup'){
    const results=[];for(const r of records().filter(x=>x.ownedImage&&x.reference&&/^sha256:[0-9a-f]{64}$/.test(x.imageId??''))){const check=spawnSync('docker',['image','inspect',r.reference,'--format','{{.Id}}'],{encoding:'utf8'});if(check.status!==0){results.push({stage:r.stage,result:'already absent'});continue;}if(check.stdout.trim()!==r.imageId){results.push({stage:r.stage,result:'preserved identity drift'});continue;}const removed=spawnSync('docker',['image','rm',r.reference],{encoding:'utf8'});results.push({stage:r.stage,result:removed.status===0?'removed exact claimed image':'failed removal',exit:removed.status});}
    for(const stage of requiredStages){const receipt=path.join(root,stage,'filesystem/spool-ownership.json');if(!fs.existsSync(receipt))continue;const own=JSON.parse(fs.readFileSync(receipt));if(!fs.existsSync(own.directory))continue;const actual=fs.realpathSync(own.directory);if(path.dirname(actual)!==fs.realpathSync(temp)||!path.basename(actual).startsWith('ornigami-inspect-spool-')||(process.getuid&&fs.statSync(actual).uid!==process.getuid())){results.push({stage,result:'preserved unproven spool ownership'});continue;}fs.rmSync(actual,{recursive:true,force:true});results.push({stage,result:'removed exact claimed spool'});}
    save(path.join(root,'cleanup.json'),results);console.log(JSON.stringify(results));if(results.some(x=>!['already absent','removed exact claimed image','removed exact claimed spool'].includes(x.result)))process.exitCode=1;return;
  }
  if(mode==='aggregate'){const result=aggregate(records(),source);save(path.join(root,'index.json'),result);process.exitCode=result.result==='passed'?0:1;return;}
  const policy=JSON.parse(fs.readFileSync(path.join(here,'minimal-parent-policy.json'))),node=process.execPath,cache=path.join(temp,'trivy-cache'),trivy=path.join(temp,'trivy');
  const parents=Object.fromEntries(policy.parents.map(x=>[x.role,'gcr.io/distroless/nodejs22-debian13@'+x.amd64Digest]));
  parents.buildkit='moby/buildkit:v0.33.1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea';parents['dockerfile-frontend']='docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e';
  const stages=mode==='parents'?['original-base','original-runtime-base','buildkit','dockerfile-frontend']:mode==='final'?['runner']:['build-base','deps','builder','prod-deps'];
  const run=(command,args,{log,timeout=180000}={})=>{const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:Math.min(timeout,remainingSeconds(process.env.ORNIGAMI_WORK_DEADLINE_EPOCH)*1000),windowsHide:true});if(log)fs.writeFileSync(log,(r.stdout??'')+(r.stderr??''));if(r.status!==0)throw Error(`${path.basename(command)} exit=${r.status} signal=${r.signal??''}`);return r.stdout;};
  const scoped=(stage,name,args,dir)=>{
    const seconds=Math.min(180,remainingSeconds(process.env.ORNIGAMI_WORK_DEADLINE_EPOCH));
    const unit=`ornigami-${stage}-${name}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
    return run('sudo',['-n','systemd-run','--scope','--quiet','--expand-environment=no','--unit='+unit,'-p','MemoryMax=2147483648','-p','MemorySwapMax=0','-p','CPUQuota=100%','/usr/sbin/runuser','-u',process.env.USER??'runner','--','env','NODE_OPTIONS=--max-old-space-size=512','GOMEMLIMIT=1536MiB','timeout','--signal=TERM','--kill-after=10s',seconds+'s',node,path.join(here,'bounded-scan-worker.mjs'),path.join(dir,name+'-resources.json'),node,...args],{log:path.join(dir,name+'.log'),timeout:(seconds+20)*1000});
  };
  for(const stage of stages){const dir=path.join(root,stage);if(fs.existsSync(path.join(dir,'driver.json')))throw Error('Refusing a second stage attempt');fs.mkdirSync(dir,{recursive:true});const record={stage,result:'failed',startedAt:new Date().toISOString()};const archive=mode==='final'?path.join(temp,'ornigami-image.tar'):path.join(temp,'ornigami-stage-'+stage+'.tar');let ownedArchive=false;
    try{
      remainingSeconds(process.env.ORNIGAMI_WORK_DEADLINE_EPOCH);const free=fs.statfsSync(temp,{bigint:true});if(free.bavail*free.bsize<20n*1024n**3n)throw Error('Less than 20 GiB disk reserve; stop rather than increase capacity');
      if(mode==='parents'){
        const existed=spawnSync('docker',['image','inspect',parents[stage]],{stdio:'ignore'}).status===0;
        run('docker',['pull','--platform','linux/amd64',parents[stage]],{log:path.join(dir,'pull.log')});record.reference=parents[stage];record.preexistingImage=existed;
        record.imageId=run('docker',['image','inspect',parents[stage],'--format','{{.Id}}']).trim();record.ownedImage=!existed;
        if(fs.existsSync(archive))throw Error('Refusing preexisting stage archive');ownedArchive=true;run('docker',['image','save','--output',archive,parents[stage]],{log:path.join(dir,'save.log')});
      }else{
        if(process.env.INITIAL_BUILD_OUTCOME!=='success'){record.result='skipped';throw Error('Initial build failed/skipped; target exports prohibited to avoid retry');}
        if(stage==='runner'){
          record.imageId=run('docker',['image','inspect','ornigami:rehearsal-'+source,'--format','{{.Id}}']).trim();
          if(!fs.existsSync(archive))throw Error('Original final archive missing; no repeated export or scan');
        }else{
          if(fs.existsSync(archive))throw Error('Refusing preexisting stage archive');ownedArchive=true;
          const builder=JSON.parse(run('docker',['inspect',process.env.OWNED_BUILDER_CONTAINER_ID]));const host=builder[0]?.HostConfig;
          if(host?.Memory!==8589934592||host.MemorySwap!==8589934592||host.CpuQuota!==300000||host.CpuPeriod!==100000||builder[0]?.Name!=='/buildx_buildkit_ornigami-external-rehearsal0')throw Error('Owned bounded BuildKit configuration drift');
          const args=['buildx','build','--builder','ornigami-external-rehearsal','--platform','linux/amd64','--target',stage,'--progress','rawjson','--output','type=docker,dest='+archive,'--label','org.opencontainers.image.revision='+source,'--metadata-file',path.join(dir,'buildkit-metadata.json'),'--build-arg','NEXT_PUBLIC_APP_URL=https://rehearsal.invalid','--build-arg','ORNIGAMI_SOURCE_SHA='+source,'--build-arg','ORNIGAMI_BUILD_HEAP_MIB=4096','--build-arg','ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=true','--build-arg','ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false','--build-arg','ORNIGAMI_BUILD_WEBPACK_WORKER=false',path.join(temp,'source')];
          const stop=path.join(dir,'observer.stop'),observations=path.join(dir,'builder-observations.jsonl');const observer=spawn(node,[path.join(here,'observe-buildkit.mjs'),process.env.OWNED_BUILDER_CONTAINER_ID,observations,stop],{stdio:'ignore'});const observerDone=new Promise(r=>{observer.once('error',r);observer.once('close',r);});
          const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});let buffer='',cacheMiss=false,provenCachedRun=false,killer;const log=fs.createWriteStream(path.join(dir,'cache-export.log'),{flags:'wx'});let malformed=false;
          const abort=()=>{child.kill('SIGTERM');killer??=setTimeout(()=>child.kill('SIGKILL'),10000);};
          const observe=data=>{log.write(data);buffer+=data.toString();let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;try{const event=JSON.parse(line);provenCachedRun||=cachedTargetRun(event,stage);if(rejectReexecution(event)){cacheMiss=true;abort();}}catch{malformed=true;abort();}}};child.stdout.on('data',observe);child.stderr.on('data',observe);
          const timer=setTimeout(abort,Math.min(180,remainingSeconds(process.env.ORNIGAMI_WORK_DEADLINE_EPOCH))*1000);
          let code;try{code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('close',ok);});}finally{clearTimeout(timer);clearTimeout(killer);await new Promise(r=>log.end(r));fs.writeFileSync(stop,'stop');await observerDone;}
          const last=JSON.parse(fs.readFileSync(observations,'utf8').trim().split('\n').at(-1));validateBuilderObservation(last);record.builderResources='passed OOM/limit gate; pressure and peak retained without headroom claim';
          if(code!==0||cacheMiss||malformed||!provenCachedRun)throw Error(`Cached export failed; code=${code}; uncached_RUN=${cacheMiss}; cached_target_proven=${provenCachedRun}; malformed_progress=${malformed}; no retry`);
          const metadata=JSON.parse(fs.readFileSync(path.join(dir,'buildkit-metadata.json')));record.imageId=metadata['containerimage.config.digest'];
        }
      }
      if(!/^sha256:[0-9a-f]{64}$/.test(record.imageId??''))throw Error('Exact stage image ID missing');
      record.archiveSha256=await fileHash(archive);record.archiveBytes=fs.statSync(archive).size;
      try{scoped(stage,'filesystem',[path.join(here,'analyze-docker-archive.mjs'),archive,path.join(dir,'filesystem'),stage,record.imageId],dir);}catch(error){record.nativeError=error.message;}
      const receipt=path.join(dir,'filesystem/result.json'),plan={schema:1,sourceSha:source,trivy:{path:trivy,sha256:await fileHash(trivy),cacheDirectory:cache},images:[{stage,archive,archiveSha256:record.archiveSha256,imageId:record.imageId,...(fs.existsSync(receipt)?{filesystemReceipt:receipt,filesystemReceiptSha256:await fileHash(receipt)}:{})}]};
      save(path.join(dir,'scan-plan.json'),plan);
      try{scoped(stage,'vulnerabilities',[path.join(here,'scan-image-stages.mjs'),path.join(dir,'scan-plan.json'),path.join(dir,'scan'),'--single'],dir);}catch(error){record.scanError=error.message;}
      const index=JSON.parse(fs.readFileSync(path.join(dir,'scan/index.json')));record.scanResult=index.stages[0];record.resources=['filesystem','vulnerabilities'].map(name=>{const p=path.join(dir,name+'-resources.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{resourceResult:'failed',error:'resource receipt missing'};});
      record.result=index.result==='passed'&&!record.nativeError&&record.resources.every(x=>x.resourceResult==='passed')?'passed':'failed-security-native-coverage-or-resources';record.collectionComplete=!!record.scanResult.counts&&record.scanResult.coverage!=='unverified'&&!record.nativeError&&record.resources.every(x=>x.resourceResult==='passed');
      if(stage==='original-runtime-base')fs.copyFileSync(path.join(dir,'scan',stage,'trivy.json'),path.join(temp,'base-trivy.json'));
      if(stage==='runner')fs.copyFileSync(path.join(dir,'scan',stage,'trivy.json'),path.join(temp,'trivy.json'));
    }catch(error){record.error=error.message;}
    finally{
      record.finishedAt=new Date().toISOString();save(path.join(dir,'driver.json'),record);
      if(ownedArchive&&fs.existsSync(archive)){if(path.dirname(path.resolve(archive))!==fs.realpathSync(temp))throw Error('Refusing archive cleanup outside runner temp');fs.unlinkSync(archive);}
      save(path.join(root,'index.json'),aggregate(records(),source));
    }
  }
  const complete=stages.every(stage=>records().some(x=>x.stage===stage&&x.collectionComplete));if(!complete)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
