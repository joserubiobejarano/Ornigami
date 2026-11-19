/** One new allowance only. Never invokes the old qualification command. */
import { createHash } from 'node:crypto';
import { open, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const BOUNDS=Object.freeze({seed:'https://www.iana.org/',transactions:1,logicalResources:4,getAttempts:12,redirectsPerRead:2,entityBytes:1048576,sourceMs:10000});
export const OLD_DIRECTORY='C:/Users/joser/.local/ornigami-brand-public-network/.local/brand-public-network-20261119';
export async function oldHashes(directory=OLD_DIRECTORY){
  return Object.fromEntries(await Promise.all(['EXECUTION_RESERVED','ledger.json'].map(async name=>[name,createHash('sha256').update(await readFile(resolve(directory,name))).digest('hex')])));
}
export async function reserve(directory,metadata){
  await mkdir(directory,{recursive:true,mode:0o700});
  const file=await open(resolve(directory,'EXECUTION_RESERVED'),'wx',0o600);
  try{await file.writeFile(JSON.stringify(metadata,null,2)+'\n');await file.sync();}finally{await file.close();}
}
async function main(){
  if(process.argv.length!==3 || process.argv[2]!=='--start-once')throw new Error('Only --start-once is supported. Offline checks must precede this command.');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  if(git('status','--porcelain'))throw new Error('Freeze a clean tested source before reserving live work.');
  const directory=resolve(root,'.local/brand-live-canary-20261119');
  const before=await oldHashes();
  await reserve(directory,{reservedAt:new Date().toISOString(),testedSha:git('rev-parse','HEAD'),mergeParents:git('show','-s','--format=%P','0ae3a206a6e590ce755e8eb3f869339c9c1cf60a'),bounds:BOUNDS,oldHashes:before,node:process.version,openssl:process.versions.openssl,retryAuthorized:false});
  const env={PATH:process.env.PATH,NODE_ENV:'development',GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',AUTH_SECRET:'synthetic-no-provider-auth-secret-for-local-canary',AUTH_TRUST_HOST:'true',STRIPE_SECRET_KEY:'sk_test_synthetic_no_provider_io',DATABASE_URL:'https://ci.invalid/database',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3031',OPENAI_ENABLED:'false',CAMPAIGN_LAB_GENERATION_PROVIDER:'local-test',CAMPAIGN_LAB_GENERATION_LIVE:'false',ORNIGAMI_BRAND_URL_MODE:'live',ORNIGAMI_BRAND_URL_LIVE:'true',NEXT_TELEMETRY_DISABLED:'1',ORNIGAMI_CANARY_AUDIT_DIR:directory,NODE_OPTIONS:`--import=${pathToFileURL(resolve(root,'scripts/canary/observe-brand-canary.mjs')).href}`};
  for(const key of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','-p','3031'],{cwd:root,env,stdio:['ignore','inherit','inherit'],windowsHide:true});
  await writeFile(resolve(directory,'launcher.json'),JSON.stringify({launcherPid:process.pid,childPid:child.pid,port:3031,startedAt:new Date().toISOString()}));
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  const after=await oldHashes();
  await writeFile(resolve(directory,'server-stopped.json'),JSON.stringify({stoppedAt:new Date().toISOString(),oldHashes:after,oldUnchanged:JSON.stringify(before)===JSON.stringify(after),liveServerStopped:true},null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(async error=>{console.error(error.message);process.exitCode=1;});
