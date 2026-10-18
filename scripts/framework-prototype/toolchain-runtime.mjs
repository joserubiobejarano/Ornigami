import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadToolchainRecipe} from './toolchain-contract.mjs';
import {sha256} from './tool-image.mjs';
import {skipDependentStages} from './stage-index.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export function loadToolchainOutput({temp=process.env.RUNNER_TEMP,evidence=process.env.ORNIGAMI_EVIDENCE_DIR,sourceSha=process.env.SOURCE_SHA,runId=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT,recipeDirectory=path.resolve(here,'../../deploy/coolify/toolchain')}={}) {
  if(!/^[a-f0-9]{40}$/.test(sourceSha??'')||!/^[0-9]+$/.test(runId??'')||attempt!=='1')throw Error('Exact admitted source/run/attempt required');
  const recipe=loadToolchainRecipe(recipeDirectory),output=JSON.parse(fs.readFileSync(path.join(evidence,'toolchain/output.json'))),realTemp=fs.realpathSync(temp);
  if(output.schema!==1||output.sourceSha!==sourceSha||output.runId!==runId||output.attempt!==attempt||output.contractSha256!==recipe.buildContractSha256||output.securityAcceptance!==false||output.coverageHold!==true)throw Error('Toolchain output source/run/contract binding mismatch');
  const root=fs.realpathSync(output.root);
  if(path.dirname(root)!==realTemp||!path.basename(root).startsWith('ornigami-toolchain-'+runId+'-'+attempt+'-')||(process.getuid&&fs.statSync(root).uid!==process.getuid()))throw Error('Toolchain output root ownership mismatch');
  const state=JSON.parse(fs.readFileSync(path.join(evidence,'toolchain/state.json')));
  if(state.root!==root||state.sourceSha!==sourceSha||state.runId!==runId||state.attempt!==attempt||state.contractSha256!==recipe.buildContractSha256||state.result!=='constructed-not-security-accepted'||state.pendingContainer||state.pendingImage||state.stopErrors?.length||state.containers?.length!==3||!state.containers.every(x=>x.running===false&&x.stopVerified===true)||state.binaries?.length!==8||new Set(state.binaries.map(x=>x.name)).size!==8||!recipe.contract.binaries.every(x=>state.binaries.some(b=>b.name===x.name&&/^[a-f0-9]{64}$/.test(b.sha256)&&b.bytes>0)))throw Error('Incomplete construction or compiler stop evidence');
  for(const [field,role]of [['buildkit','buildkit'],['frontend','frontend']]){
    const image=output[field];
    if(image.reference!=='ornigami-tool-'+role+':'+sourceSha||!/^sha256:[a-f0-9]{64}$/.test(image.imageId??'')||typeof image.ownedImage!=='boolean')throw Error('Constructed tooling image identity invalid');
    if(!state.images?.some(x=>x.reference===image.reference&&x.imageId===image.imageId&&x.ownedImage===image.ownedImage))throw Error('Tooling image absent from construction ownership record');
  }
  const stages=['toolchain-compiler','toolchain-go-base','toolchain-runtime-base','toolchain-runtime-base-installed'];
  if(output.supplemental?.length!==4||output.supplemental.map(x=>x.stage).sort().join(',')!==stages.join(',')||!output.supplemental.every(x=>x.result==='passed'&&x.scanResult?.result==='passed'&&!x.scanResult.counts?.HIGH&&!x.scanResult.counts?.CRITICAL))throw Error('Complete passing bootstrap reports required before tooling use');
  if(output.frontend.manifestDigest!==recipe.expectedFrontend.manifestDigest||output.frontend.imageId!==recipe.expectedFrontend.configDigest||output.frontend.binarySha256!==recipe.expectedFrontend.binarySha256)throw Error('Reviewed frontend identity drift');
  if(state.binaries.find(x=>x.name==='dockerfile-frontend')?.sha256!==recipe.expectedFrontend.binarySha256)throw Error('Frontend construction binary identity drift');
  const directory=fs.realpathSync(output.frontend.ociDirectory);
  if(directory!==path.join(root,'frontend/oci'))throw Error('Frontend OCI directory ownership mismatch');
  const readBlob=digest=>{
    if(!/^sha256:[a-f0-9]{64}$/.test(digest))throw Error('Invalid OCI digest');
    const file=path.join(directory,'blobs/sha256',digest.slice(7));
    if(fs.statSync(file).size>64*1024*1024)throw Error('Frontend blob exceeds bound');
    const bytes=fs.readFileSync(file);if('sha256:'+sha256(bytes)!==digest)throw Error('Frontend OCI blob content drift');return bytes;
  };
  const manifest=JSON.parse(readBlob(output.frontend.manifestDigest));
  if(manifest.schemaVersion!==2||manifest.config?.digest!==recipe.expectedFrontend.configDigest||manifest.layers?.length!==1||manifest.layers[0].digest!==recipe.expectedFrontend.layerDigest)throw Error('Frontend OCI descriptor drift');
  const config=JSON.parse(readBlob(manifest.config.digest));
  readBlob(manifest.layers[0].digest);
  if(config.architecture!=='amd64'||config.os!=='linux'||config.rootfs?.diff_ids?.length!==1||config.rootfs.diff_ids[0]!==recipe.expectedFrontend.layerDigest||config.config?.Labels?.['org.ornigami.experimental-toolchain']!==recipe.buildContractSha256)throw Error('Frontend OCI config/platform/recipe drift');
  return {...output,recipe,builtBinaries:state.binaries,frontendBuildArguments:['--build-context','ornigami-frontend=oci-layout://'+directory+'@'+output.frontend.manifestDigest]};
}
export async function gateTooling() {
  const output=loadToolchainOutput(),root=path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'stage-scans'),index=JSON.parse(fs.readFileSync(path.join(root,'index.json')));
  const parents=['original-base','original-runtime-base','buildkit','dockerfile-frontend'];
  if(index.sourceSha!==output.sourceSha||!parents.every(stage=>index.stages.some(x=>x.stage===stage&&x.result==='passed'&&x.collectionComplete===true&&x.scanResult?.result==='passed')))throw Error('Both tooling and signed parent scan/native/resource gates must pass before BuildKit execution');
  if(output.recipe.trialScope==='tooling'){
    skipDependentStages(root,output.sourceSha,'Intentional tooling-only preflight; application compilation and dependent stages not requested');
  }
  fs.writeFileSync(path.join(process.env.ORNIGAMI_EVIDENCE_DIR,'toolchain/prerequisites.json'),JSON.stringify({sourceSha:output.sourceSha,runId:output.runId,attempt:output.attempt,contractSha256:output.contractSha256,result:'passed tooling prerequisites only',securityAcceptance:false,coverageHold:true,scope:output.recipe.trialScope},null,2)+'\n',{flag:'wx'});
  return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const mode=process.argv[2],output=mode==='gate'?await gateTooling():loadToolchainOutput();
    if(mode==='image')console.log(output.buildkit.reference);
    else if(mode==='image-id')console.log(output.buildkit.imageId);
    else if(mode==='args'){
      const destination=path.resolve(process.argv[3]);
      if(path.dirname(destination)!==fs.realpathSync(process.env.RUNNER_TEMP))throw Error('Tool argument file must be a new direct runner child');
      fs.writeFileSync(destination,output.frontendBuildArguments.join('\0')+'\0',{flag:'wx'});
    }else if(mode!=='gate'&&mode!=='verify')throw Error('Expected gate/image/args/verify');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
