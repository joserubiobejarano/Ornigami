import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadToolchainOutput} from './toolchain-runtime.mjs';
import {validateBuilderObservation} from './serial-scan-driver.mjs';
import {requireFrozenDatabase} from './frozen-db-admission.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export function compatibilityDockerfile(base){
  if(!/^sha256:[a-f0-9]{64}$/.test(base))throw Error('Pinned probe base required');
  return '# syntax=ornigami-frontend\nFROM docker.io/library/alpine@'+base+' AS probe\nRUN --network=none test "$(uname -m)" = x86_64 && printf "ornigami-toolchain-compatible\\n" > /compatibility.txt\nFROM scratch\nCOPY --from=probe /compatibility.txt /compatibility.txt\n';
}
export async function probeToolchain(){
  if(process.platform!=='linux'||process.version!=='v22.23.3')throw Error('Pinned Linux Node required');
  const tool=loadToolchainOutput(),container=process.env.BUILDKIT_CONTAINER_ID;
  if(tool.recipe.trialScope!=='tooling'||!/^[a-f0-9]{64}$/.test(container??''))throw Error('Explicit tooling-only scope and immutable builder ID required');
  const evidence=path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'toolchain'),prerequisites=JSON.parse(fs.readFileSync(path.join(evidence,'prerequisites.json')));
  if(prerequisites.sourceSha!==tool.sourceSha||prerequisites.runId!==tool.runId||prerequisites.attempt!==tool.attempt||prerequisites.contractSha256!==tool.contractSha256||prerequisites.result!=='passed tooling prerequisites only')throw Error('Tooling prerequisite receipt mismatch');
  const lease=()=>requireFrozenDatabase({admissionDirectory:path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'stage-scans/database-admission'),cacheDirectory:path.join(process.env.RUNNER_TEMP,'trivy-cache'),scannerPath:path.join(process.env.RUNNER_TEMP,'trivy'),scannerSha256:'1f889576636db0623539cb339df7d06c40ebf39e7919489eafa1160e29808f19',sourceSha:tool.sourceSha});
  await lease();
  const inspected=spawnSync('docker',['inspect',container],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  if(inspected.status!==0)throw Error('Builder identity unavailable');
  const row=JSON.parse(inspected.stdout)[0],h=row?.HostConfig;
  if(row?.Id!==container||row.Name!=='/buildx_buildkit_ornigami-external-rehearsal0'||row.Image!==tool.buildkit.imageId||!row.State?.Running||h?.Memory!==8589934592||h.MemorySwap!==8589934592||h.CpuQuota!==300000||h.CpuPeriod!==100000)throw Error('Probe builder identity or limits drift');
  const space=fs.statfsSync(tool.root,{bigint:true});if(space.bavail*space.bsize<20n*1024n**3n)throw Error('Probe disk reserve unavailable');
  const context=path.join(tool.root,'compatibility-context'),result=path.join(tool.root,'compatibility-result');fs.mkdirSync(context);
  fs.writeFileSync(path.join(context,'Dockerfile'),compatibilityDockerfile(tool.recipe.contract.bases.runtime.amd64Digest),{flag:'wx'});
  const stop=path.join(tool.root,'probe-observer.stop'),observations=path.join(evidence,'compatibility-observations.jsonl');
  const observer=spawn(process.execPath,[path.join(here,'observe-buildkit.mjs'),container,observations,stop],{stdio:'ignore'});
  let observerError;const observed=new Promise(resolve=>{observer.once('error',error=>{observerError=error;resolve();});observer.once('close',(code,signal)=>{if(code!==0||signal)observerError=Error('Probe observer failed');resolve();});});
  const receipt={schema:1,sourceSha:tool.sourceSha,runId:tool.runId,attempt:tool.attempt,contractSha256:tool.contractSha256,containerId:container,buildkitImageId:tool.buildkit.imageId,frontendManifest:tool.frontend.manifestDigest,result:'failed',securityAcceptance:false,coverageHold:true};
  try{
    const seconds=Math.min(180,Math.floor(Number(process.env.ORNIGAMI_WORK_DEADLINE_EPOCH)-Date.now()/1000));if(!Number.isFinite(seconds)||seconds<1)throw Error('Probe work deadline exhausted');
    const args=['buildx','build','--builder','ornigami-external-rehearsal','--platform','linux/amd64',...tool.frontendBuildArguments,'--network','none','--no-cache','--progress','plain','--output','type=local,dest='+result,context];
    fs.writeFileSync(path.join(evidence,'compatibility-arguments.json'),JSON.stringify(args,null,2)+'\n',{flag:'wx'});
    const log=fs.openSync(path.join(evidence,'compatibility-build.log'),'wx',0o600);
    let exit;try{exit=await new Promise(resolve=>{const child=spawn('timeout',['--signal=TERM','--kill-after=10s',seconds+'s','docker',...args],{stdio:['ignore',log,log]});child.once('error',error=>resolve({error:error.message}));child.once('close',(code,signal)=>resolve({code,signal}));});}finally{fs.closeSync(log);}
    receipt.buildExit=exit;
    if(exit.code!==0||exit.signal||exit.error)throw Error('Tooling compatibility build failed; no retry');
    const marker=fs.readFileSync(path.join(result,'compatibility.txt'),'utf8');if(marker!=='ornigami-toolchain-compatible\n')throw Error('Tooling compatibility output mismatch');
    receipt.outputVerified=true;
  }catch(error){receipt.error=error.message;}
  finally{fs.writeFileSync(stop,'stop\n');await observed;}
  try{
    if(observerError)throw observerError;
    const rows=fs.readFileSync(observations,'utf8').trim().split('\n').map(JSON.parse);
    if(rows.some(r=>r.containerId!==container))throw Error('Probe observer identity drift');
    validateBuilderObservation(rows.at(-1));receipt.resourceResult='passed OOM/limit gate; pressure and peak retained without headroom claim';
    await lease();
    if(receipt.outputVerified&&!receipt.error)receipt.result='passed tooling compatibility only';
  }catch(error){receipt.error??=error.message;}
  fs.writeFileSync(path.join(evidence,'compatibility.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(receipt.result!=='passed tooling compatibility only')throw Error(receipt.error??'Tooling probe incomplete');
  console.log(receipt.result+'; no application build or overall security acceptance');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await probeToolchain();}catch(error){console.error(error.message);process.exitCode=1;}
}
