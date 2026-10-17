import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadToolchainRecipe,downloadPinnedFile} from './toolchain-contract.mjs';
import {writeFrontendImage,sha256} from './tool-image.mjs';
import {requireFrozenDatabase} from './frozen-db-admission.mjs';
import {cleanupOwnedImages} from './cleanup-owned-images.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const writeJSON=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const isId=value=>/^[0-9a-f]{64}$/.test(value??'');
async function fileHash(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}

export async function buildToolchain() {
  if(process.platform!=='linux'||process.arch!=='x64'||process.version!=='v22.23.3')throw Error('Pinned Linux Node required for experimental tool construction');
  const temp=fs.realpathSync(process.env.RUNNER_TEMP),source=process.env.SOURCE_SHA,runId=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
  if(!/^[a-f0-9]{40}$/.test(source??'')||!/^[0-9]+$/.test(runId??'')||attempt!=='1')throw Error('Exact admitted source/run/attempt required');
  const recipeDir=path.resolve(here,'../../deploy/coolify/toolchain'),recipe=loadToolchainRecipe(recipeDir),contract=recipe.contract;
  if(path.dirname(fs.realpathSync(process.env.ORNIGAMI_EVIDENCE_DIR))!==temp)throw Error('Tool evidence root outside admitted runner directory');
  const evidence=path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'toolchain');fs.mkdirSync(evidence);
  const root=fs.mkdtempSync(path.join(temp,'ornigami-toolchain-'+runId+'-'+attempt+'-'));fs.chmodSync(root,0o700);
  const owner={root,parent:temp,uid:process.getuid(),sourceSha:source,runId,attempt,contractSha256:recipe.buildContractSha256};
  writeJSON(path.join(evidence,'owner.json'),owner);
  const state={schema:1,...owner,result:'in-progress',securityAcceptance:false,coverageHold:true,containers:[],images:[],supplemental:[],binaries:[],phase:'initialize'};
  const stateFile=path.join(evidence,'state.json'),save=()=>writeJSON(stateFile,state);
  const deadline=Number(process.env.ORNIGAMI_WORK_DEADLINE_EPOCH)*1000;
  function remaining(max=180000){const n=deadline-Date.now();if(!Number.isFinite(n)||n<1000)throw Error('Tooling work deadline exhausted; no retry');return Math.min(max,n);}
  function reserveDisk(){const s=fs.statfsSync(temp,{bigint:true});if(s.bavail*s.bsize<20n*1024n**3n)throw Error('Tooling phase lost 20 GiB disk reserve');}
  let logIndex=0;
  function command(executable,args,{timeout=180000,log=true}={}) {
    reserveDisk();const r=spawnSync(executable,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:remaining(timeout),windowsHide:true});
    if(log){const base=String(logIndex++).padStart(3,'0')+'-'+path.basename(executable);fs.writeFileSync(path.join(evidence,base+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(evidence,base+'.stderr'),r.stderr??'');}
    if(r.status!==0||r.error||r.signal)throw Error(path.basename(executable)+' failed during '+state.phase+'; exit='+r.status+' signal='+(r.signal??''));
    return (r.stdout??'').trim();
  }
  const docker=(args,options)=>command('docker',args,options);
  function imageExists(reference){
    const byId=/^sha256:[a-f0-9]{64}$/.test(reference);
    const args=['image','ls','--all','--quiet','--no-trunc',...(byId?[]:['--filter','reference='+reference])];
    const rows=docker(args,{log:false}).split(/\s+/).filter(Boolean);
    if(rows.some(id=>!/^sha256:[a-f0-9]{64}$/.test(id)))throw Error('Image ownership inventory malformed');
    if(byId)return rows.includes(reference)?reference:null;
    const unique=[...new Set(rows)];if(unique.length>1)throw Error('Ambiguous experimental image reference');
    return unique[0]??null;
  }
  function claimImage(reference,id,preexisting=false,stage) {
    if(!/^sha256:[a-f0-9]{64}$/.test(id))throw Error('Constructed image identity missing');
    const record={reference,imageId:id,ownedImage:!preexisting,stage:stage??reference};state.images.push(record);delete state.pendingImage;save();return record;
  }
  function assertTagUnused(tag){if(imageExists(tag))throw Error('Refusing pre-existing experimental image tag');}
  function inspectContainer(container) {
    const rows=JSON.parse(docker(['inspect',container.id],{log:false})),r=rows[0],h=r?.HostConfig;
    if(r?.Id!==container.id||r.Name!=='/'+container.name||r.Config?.Labels?.['org.ornigami.toolchain.run']!==runId||r.Config?.Labels?.['org.ornigami.toolchain.source']!==source||h?.Memory!==container.memory||h.MemorySwap!==container.memory||h.NanoCpus!==container.cpus*1e9)throw Error('Owned tool container identity/resource drift');
    return r;
  }
  function metrics(container,name) {
    inspectContainer(container);
    const text=docker(['exec',container.id,'sh','-c','for k in memory.max memory.swap.max memory.current memory.peak memory.events memory.pressure cpu.max cpu.stat pids.current pids.max; do printf "==%s==\\n" "$k"; cat "/sys/fs/cgroup/$k" || exit 1; done'],{log:false});
    fs.writeFileSync(path.join(evidence,name+'.txt'),text+'\n');
    if(!text.includes('==memory.max==\n'+container.memory+'\n')||!text.includes('==memory.swap.max==\n0\n')||!text.includes('==cpu.max==\n'+(container.cpus*100000)+' 100000\n'))throw Error('Actual tool container cgroup limit drift');
    const events=text.match(/==memory.events==\n([\s\S]*?)(?=\n==)/)?.[1];
    if(!events||['oom','oom_kill','oom_group_kill'].some(k=>!events.split('\n').includes(k+' 0')))throw Error('Tool container OOM/kill counters nonzero or missing');
    return text;
  }
  function startContainer(role,image,{compiler=false,mounts=[],network='none'}={}) {
    const name='ornigami-tool-'+role+'-'+runId+'-'+attempt;
    const names=docker(['ps','--all','--format','{{.Names}}'],{log:false}).split('\n');
    if(names.includes(name))throw Error('Refusing pre-existing tool container');
    const memory=compiler?8589934592:2147483648,cpus=compiler?3:1;
    state.pendingContainer={name,role};save();
    const args=['run','--detach','--name',name,'--memory='+memory,'--memory-swap='+memory,'--cpus='+cpus,'--pids-limit='+(compiler?512:128),'--security-opt','no-new-privileges:true','--network',network,'--label','org.ornigami.toolchain.run='+runId,'--label','org.ornigami.toolchain.source='+source];
    for(const mount of mounts)args.push('--mount',mount);
    args.push('--entrypoint','sh',image,'-c','sleep 1800');
    const id=docker(args);if(!isId(id))throw Error('Tool container ID unavailable after create; preserve pending ownership');
    const container={role,name,id,memory,cpus,running:true};state.containers.push(container);delete state.pendingContainer;save();metrics(container,role+'-before');return container;
  }
  function stopContainer(container) {
    if(!container.running)return;
    let metricError;try{metrics(container,container.role+'-after');}catch(error){metricError=error;}
    // Stop the exact recorded immutable ID even after a work deadline/OOM.
    // This is bounded failure cleanup, never a retry or new work phase.
    const stopped=spawnSync('docker',['stop','--time','10',container.id],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
    const after=spawnSync('docker',['inspect',container.id,'--format','{{.State.Running}}'],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
    container.stopExit=stopped.status;container.stopVerified=stopped.status===0&&after.status===0&&after.stdout.trim()==='false';
    if(container.stopVerified)container.running=false;save();
    if(!container.stopVerified)throw Error('Owned tool container stop not verified');
    if(metricError)throw metricError;
  }
  function commitContainer(container,tag,changes=[]) {
    assertTagUnused(tag);inspectContainer(container);
    state.pendingImage={reference:tag,operation:'commit',containerId:container.id};save();
    const args=['commit'];for(const change of changes)args.push('--change',change);
    args.push(container.id,tag);const id=docker(args);return claimImage(tag,id,false);
  }
  const admissionDirectory=path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'stage-scans/database-admission'),cache=path.join(temp,'trivy-cache'),trivy=path.join(temp,'trivy');
  async function lease(){return requireFrozenDatabase({admissionDirectory,cacheDirectory:cache,scannerPath:trivy,scannerSha256:'1f889576636db0623539cb339df7d06c40ebf39e7919489eafa1160e29808f19',sourceSha:source});}
  async function scanInput(image,stage) {
    await lease();state.phase='scan-'+stage;save();
    const dir=path.join(evidence,stage);fs.mkdirSync(dir);
    const archive=path.join(root,stage+'.tar');docker(['image','save','--output',archive,image.reference]);
    const archiveSha256=await fileHash(archive),scope=(name,args)=>{
      const seconds=Math.floor(remaining(180000)/1000);
      command('sudo',['-n','systemd-run','--scope','--quiet','--expand-environment=no','--unit=ornigami-'+stage+'-'+name+'-'+runId+'-'+attempt,'-p','MemoryMax=2147483648','-p','MemorySwapMax=0','-p','CPUQuota=100%','/usr/sbin/runuser','-u',process.env.USER??'runner','--','env','NODE_OPTIONS=--max-old-space-size=512','GOMEMLIMIT=1536MiB','timeout','--signal=TERM','--kill-after=10s',seconds+'s',process.execPath,path.join(here,'bounded-scan-worker.mjs'),path.join(dir,name+'-resources.json'),process.execPath,...args],{timeout:seconds*1000+15000});
    };
    scope('filesystem',[path.join(here,'analyze-docker-archive.mjs'),archive,path.join(dir,'filesystem'),stage,image.imageId]);
    const receipt=path.join(dir,'filesystem/result.json');
    const plan={schema:1,sourceSha:source,trivy:{path:trivy,sha256:await fileHash(trivy),cacheDirectory:cache,admissionDirectory,admissionSha256:await fileHash(path.join(admissionDirectory,'index.json'))},images:[{stage,archive,archiveSha256,imageId:image.imageId,filesystemReceipt:receipt,filesystemReceiptSha256:await fileHash(receipt)}]};
    writeJSON(path.join(dir,'plan.json'),plan);
    scope('vulnerabilities',[path.join(here,'scan-image-stages.mjs'),path.join(dir,'plan.json'),path.join(dir,'scan'),'--single']);
    const result=JSON.parse(fs.readFileSync(path.join(dir,'scan/index.json')));
    if(result.result!=='passed')throw Error('Bootstrap tool input failed complete security threshold');
    for(const name of ['filesystem','vulnerabilities']){const r=JSON.parse(fs.readFileSync(path.join(dir,name+'-resources.json')));if(r.result!=='passed'||r.resourceResult!=='passed'||!r.limitsVerified)throw Error('Bootstrap tool diagnostic resource gate failed');}
    state.supplemental.push({stage,imageId:image.imageId,archiveSha256,scanResult:result.stages[0],result:'passed'});save();
  }
  let observer,observerDone,observerStop;
  try {
    await lease();reserveDisk();save();
    state.phase='download-pinned-inputs';save();
    const downloads=path.join(root,'downloads'),apks=path.join(root,'apks');fs.mkdirSync(downloads);fs.mkdirSync(apks);
    const tasks=[...Object.entries(contract.sources).map(([name,s])=>({input:s,file:path.join(downloads,name+'.tgz')})),...recipe.apk.packages.map(p=>({input:p,file:path.join(apks,p.filename)}))];
    let cursor=0;async function worker(){while(cursor<tasks.length){const task=tasks[cursor++];reserveDisk();await downloadPinnedFile(task.input,task.file,{deadline});}}
    const downloadsFinished=await Promise.allSettled([worker(),worker(),worker(),worker()]);
    const downloadFailure=downloadsFinished.find(x=>x.status==='rejected');
    if(downloadFailure)throw downloadFailure.reason;
    command('python3',[path.join(here,'extract-tool-sources.py'),path.join(recipeDir,'recipe.json'),downloads,path.join(root,'sources'),recipeDir]);
    const baseRecords={};
    for(const [name,base]of Object.entries(contract.bases)){
      state.phase='pull-'+name+'-base';save();const reference='docker.io/'+base.repository+'@'+base.amd64Digest,existing=imageExists(base.configDigest);
      state.pendingImage={reference,imageId:base.configDigest,preexisting:!!existing,operation:'pull'};save();
      docker(['pull','--platform','linux/amd64',reference]);
      const id=docker(['image','inspect',reference,'--format','{{.Id}}'],{log:false});
      if(id!==base.configDigest)throw Error('Official compiler/runtime base config mismatch');
      baseRecords[name]=claimImage(reference,id,!!existing,'toolchain-'+name+'-original');
    }
    await scanInput(baseRecords.compiler,'toolchain-go-base');
    await scanInput(baseRecords.runtime,'toolchain-runtime-base');
    state.phase='verify-apk-and-prepare-compiler';save();
    const prep=startContainer('prepare',baseRecords.compiler.reference,{mounts:['type=bind,src='+apks+',dst=/apks,readonly']});
    docker(['exec',prep.id,'apk','verify','--quiet',...recipe.apk.packages.map(p=>'/apks/'+p.filename)]);
    const select=names=>names.map(name=>{const p=recipe.apk.packages.find(p=>p.name===name);if(!p)throw Error('APK closure package missing');return '/apks/'+p.filename;});
    docker(['exec',prep.id,'apk','--no-network','--no-cache','--repositories-file','/dev/null','add',...select(recipe.apk.compilerClosure)]);
    stopContainer(prep);
    const compilerImage=commitContainer(prep,'ornigami-tool-compiler:'+source);
    await scanInput(compilerImage,'toolchain-compiler');
    for(const n of ['out','cache','cache/mod','cache/build','cache/tmp'])fs.mkdirSync(path.join(root,n),{recursive:true});
    state.phase='compile-eight-pinned-binaries';save();
    const compiler=startContainer('compile',compilerImage.reference,{compiler:true,network:'bridge',mounts:['type=bind,src='+path.join(root,'sources')+',dst=/src,readonly','type=bind,src='+path.join(root,'out')+',dst=/out','type=bind,src='+path.join(root,'cache')+',dst=/cache']});
    if(docker(['exec',compiler.id,'sha256sum','/usr/local/go/bin/go'],{log:false}).split(/\s+/)[0]!==contract.goBinary.sha256)throw Error('Compiler Go executable changed');
    if(docker(['exec',compiler.id,'go','version'],{log:false})!=='go version go1.27.2 linux/amd64')throw Error('Wrong actual Go compiler version');
    observerStop=path.join(root,'compiler-observer.stop');
    observer=spawn(process.execPath,[path.join(here,'observe-buildkit.mjs'),compiler.id,path.join(evidence,'compiler-observations.jsonl'),observerStop,'toolchain'],{stdio:'ignore'});
    observerDone=new Promise(resolve=>{observer.once('error',resolve);observer.once('close',resolve);});
    const compileDeadline=Math.min(deadline,Date.now()+contract.compiler.maxSeconds*1000);
    for(const binary of contract.binaries){
      await lease();reserveDisk();const environment={GOOS:'linux',GOARCH:'amd64',GOAMD64:'v1',GOTOOLCHAIN:'local',GOWORK:'off',GOENV:'off',GOFLAGS:'-mod=readonly',GOPROXY:contract.modules.proxy,GOSUMDB:contract.modules.sumdb,GOPRIVATE:'',GONOPROXY:'',GONOSUMDB:'',GOMODCACHE:'/cache/mod',GOCACHE:'/cache/build',GOTMPDIR:'/cache/tmp',GOMAXPROCS:String(contract.compiler.GOMAXPROCS),GOMEMLIMIT:contract.compiler.GOMEMLIMIT,CGO_ENABLED:binary.cgo?'1':'0'};
      const args=['exec','--workdir','/src/'+binary.source];for(const [key,value]of Object.entries(environment))args.push('--env',key+'='+value);
      args.push(compiler.id,'go','build','-p=2','-mod=readonly','-trimpath','-buildvcs=false','-tags='+binary.tags,'-ldflags='+binary.ldflags,'-o','/out/'+binary.name,binary.package);
      const time=compileDeadline-Date.now();if(time<1000)throw Error('Tool compilation deadline exhausted; no retry');docker(args,{timeout:time});
      metrics(compiler,'compile-'+binary.name);
      const file=path.join(root,'out',binary.name),bytes=fs.statSync(file).size;if(bytes>128*1024*1024)throw Error('Unexpected tooling binary size');
      const info=docker(['exec',compiler.id,'go','version','-m','/out/'+binary.name]);fs.writeFileSync(path.join(evidence,binary.name+'-build-info.txt'),info+'\n');if(!info.includes('go1.27.2'))throw Error('Wrong compiler in produced Go binary');
      state.binaries.push({name:binary.name,bytes,sha256:await fileHash(file)});save();
    }
    fs.writeFileSync(observerStop,'stop\n');await observerDone;observer=undefined;
    command(process.execPath,[path.join(here,'validate-build-observation.mjs'),path.join(evidence,'compiler-observations.jsonl'),compiler.id]);
    stopContainer(compiler);
    state.phase='assemble-pinned-frontend';save();
    const frontendBytes=fs.readFileSync(path.join(root,'out/dockerfile-frontend')),frontTag='ornigami-tool-frontend:'+source;assertTagUnused(frontTag);
    const front=writeFrontendImage(frontendBytes,contract,path.join(root,'frontend'),frontTag);
    for(const key of ['binarySha256','configDigest','manifestDigest','layerDigest'])if(front[key]!==recipe.expectedFrontend[key])throw Error('Linux frontend differs from reviewed deterministic '+key);
    const preexistingFrontend=imageExists(front.configDigest);
    state.pendingImage={reference:frontTag,imageId:front.configDigest,preexisting:!!preexistingFrontend,operation:'load'};save();
    docker(['load','--input',path.join(root,'frontend/image.tar')]);if(imageExists(frontTag)!==front.configDigest)throw Error('Loaded frontend image identity mismatch');
    const frontend=claimImage(frontTag,front.configDigest,!!preexistingFrontend,'dockerfile-frontend');
    state.phase='assemble-buildkit-runtime';save();
    const runtime=startContainer('runtime',baseRecords.runtime.reference,{mounts:['type=bind,src='+apks+',dst=/apks,readonly']});
    docker(['exec',runtime.id,'apk','--no-network','--no-cache','--repositories-file','/dev/null','add',...select(recipe.apk.runtimeClosure)]);
    stopContainer(runtime);
    const runtimeBase=commitContainer(runtime,'ornigami-tool-runtime-base:'+source);
    await scanInput(runtimeBase,'toolchain-runtime-base-installed');
    for(const binary of contract.binaries.filter(b=>b.name!=='dockerfile-frontend'))docker(['cp',path.join(root,'out',binary.name),runtime.id+':/usr/bin/'+binary.name]);
    const scripts=[['hack/buildkitd-entrypoint','buildkitd-entrypoint'],['hack/with-cgroupfs-remount','with-cgroupfs-remount'],['examples/buildctl-daemonless/buildctl-daemonless.sh','buildctl-daemonless.sh']];
    for(const [file,name]of scripts)docker(['cp',path.join(root,'sources/buildkit',file),runtime.id+':/usr/bin/'+name]);
    const tag='ornigami-tool-buildkit:'+source,builder=commitContainer(runtime,tag,['ENV BUILDKIT_SETUP_CGROUPV2_ROOT=1','ENTRYPOINT ["/usr/bin/buildkitd-entrypoint"]','CMD []','VOLUME ["/var/lib/buildkit"]','LABEL org.opencontainers.image.source=https://github.com/moby/buildkit org.opencontainers.image.revision='+contract.sources.buildkit.commit+' org.ornigami.experimental-toolchain='+recipe.buildContractSha256]);
    state.phase='complete';state.result='constructed-not-security-accepted';save();
    const output={schema:1,sourceSha:source,runId,attempt,contractSha256:recipe.buildContractSha256,root,buildkit:builder,frontend:{...frontend,ociDirectory:path.join(root,'frontend/oci'),manifestDigest:front.manifestDigest,binarySha256:front.binarySha256},supplemental:state.supplemental,result:'constructed; both final tooling scans and compatibility still required',securityAcceptance:false,coverageHold:true};
    writeJSON(path.join(evidence,'output.json'),output);console.log(JSON.stringify({result:state.result,sourceSha:source,toolchainContract:recipe.buildContractSha256,scope:'No application compilation, registry upload or deployment'}));
  }catch(error){state.result='failed';state.error=error.message;save();throw error;}
  finally{
    if(observer){fs.writeFileSync(observerStop,'stop\n');await observerDone;}
    for(const container of state.containers.filter(c=>c.running)){
      try{stopContainer(container);}catch(error){state.stopErrors??=[];state.stopErrors.push({id:container.id,error:error.message});save();}
    }
  }
}

export function cleanupToolchain() {
  const evidence=path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'toolchain'),file=path.join(evidence,'state.json');
  if(!fs.existsSync(file)){console.log('Toolchain construction not started; no ownership claims');return;}
  const state=JSON.parse(fs.readFileSync(file)),temp=fs.realpathSync(process.env.RUNNER_TEMP);
  if(state.sourceSha!==process.env.SOURCE_SHA||state.runId!==process.env.GITHUB_RUN_ID||state.attempt!==process.env.GITHUB_RUN_ATTEMPT||state.parent!==temp||path.dirname(fs.realpathSync(state.root))!==temp||!path.basename(state.root).startsWith('ornigami-toolchain-'+state.runId+'-'+state.attempt+'-')||fs.statSync(state.root).uid!==process.getuid())throw Error('Toolchain cleanup ownership mismatch');
  const invoke=args=>spawnSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  const results=[];
  for(const c of state.containers){
    const list=invoke(['ps','--all','--quiet','--no-trunc']);
    if(list.status!==0){results.push({id:c.id,result:'inventory unavailable'});continue;}
    if(!list.stdout.trim().split(/\s+/).includes(c.id)){results.push({id:c.id,result:'already absent',absenceVerified:true});continue;}
    const inspected=invoke(['inspect',c.id]);
    let row;try{row=JSON.parse(inspected.stdout)[0];}catch{}
    if(inspected.status!==0||row?.Id!==c.id||row.Name!=='/'+c.name||row.Config?.Labels?.['org.ornigami.toolchain.run']!==state.runId||row.Config?.Labels?.['org.ornigami.toolchain.source']!==state.sourceSha){results.push({id:c.id,result:'preserved unproven container identity'});continue;}
    const removal=invoke(['rm','-f',c.id]),after=invoke(['ps','--all','--quiet','--no-trunc']),absent=after.status===0&&!after.stdout.trim().split(/\s+/).includes(c.id);
    results.push({id:c.id,result:removal.status===0&&absent?'removed exact owned container':'failed removal/read-back',absenceVerified:absent,removalExit:removal.status});
  }
  results.push(...cleanupOwnedImages([...state.images].reverse()));
  if(state.pendingContainer)results.push({result:'pending container ownership unresolved; preserved',name:state.pendingContainer.name});
  if(state.pendingImage)results.push({result:'pending image ownership unresolved; preserved',reference:state.pendingImage.reference});
  const passed=results.every(r=>r.absenceVerified===true&&['already absent','removed exact owned container','removed exact claimed image'].includes(r.result));
  if(passed){const root=fs.realpathSync(state.root);fs.rmSync(root,{recursive:true,force:false});if(fs.existsSync(root))throw Error('Owned tool root remains after removal');}
  writeJSON(path.join(evidence,'cleanup.json'),{sourceSha:state.sourceSha,results,ownedRootRemoved:passed&&!fs.existsSync(state.root),result:passed?'passed':'failed'});
  console.log(JSON.stringify({toolchainCleanup:passed?'passed':'failed',results,ownedRootRemoved:passed&&!fs.existsSync(state.root)}));
  if(!passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv[2]==='build')await buildToolchain();else if(process.argv[2]==='cleanup')cleanupToolchain();else throw Error('Expected build or cleanup');}catch(error){console.error(error.message);process.exitCode=1;}
}
