import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {validateResourceObservation} from './admission-only.mjs';
const [root,sourceSha]=process.argv.slice(2);
const out=path.join(root,'evidence');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'phases.json'),JSON.stringify({sourceSha,phases:Object.fromEntries(['download','admission','fixtures'].map(name=>[name,{result:'skipped',reason:'worker resource admission has not passed'}])),imageWork:'out-of-scope',custody:'not-assessed'},null,2)+'\n');
const record={startedAt:new Date().toISOString(),result:'failed',resourceResult:'failed',resourceErrors:[],samples:[],node:process.version,nodeHeapMiB:512};
const metrics=['memory.max','memory.swap.max','memory.current','memory.peak','memory.events','cpu.max','cpu.stat'];
let group;
let child,timer,deadline;
function save(){fs.writeFileSync(path.join(out,'resources.json'),JSON.stringify(record,null,2)+'\n');}
function snapshot(){
  const cgroup=Object.fromEntries(metrics.map(k=>[k,fs.readFileSync(path.join('/sys/fs/cgroup',group??'missing',k),'utf8').trim()]));
  const stat=fs.statfsSync(root,{bigint:true}),diskFreeBytes=String(stat.bavail*stat.bsize);
  const s={at:new Date().toISOString(),monotonicNs:String(process.hrtime.bigint()),diskFreeBytes,cgroup};record.samples.push(s);save();
  validateResourceObservation(s);
}
function sample(){try{snapshot();}catch(error){record.resourceErrors.push(error.message);throw error;}}
function stop(error){record.error=error.message;if(child?.pid){try{process.kill(-child.pid,'SIGKILL');}catch{}}}
try{
  if(process.platform!=='linux'||process.arch!=='x64'||process.version!=='v22.23.3'||!process.execArgv.includes('--max-old-space-size=512'))throw Error('Pinned Linux amd64 Node/heap required');
  group=fs.readFileSync('/proc/self/cgroup','utf8').split('\n').find(s=>s.startsWith('0::'))?.slice(3);
  sample();
  const stdout=fs.openSync(path.join(out,'controller.stdout'),'w'),stderr=fs.openSync(path.join(out,'controller.stderr'),'w');
  child=spawn(process.execPath,['--max-old-space-size=512','scripts/framework-prototype/admission-only.mjs',root,sourceSha],{detached:true,stdio:['ignore',stdout,stderr],env:{...process.env,NODE_OPTIONS:'--max-old-space-size=512'}});
  fs.closeSync(stdout);fs.closeSync(stderr);
  timer=setInterval(()=>{try{sample();}catch(e){stop(e);}},1000);
  deadline=setTimeout(()=>stop(Error('360 second work deadline exceeded')),360000);
  const result=await new Promise(resolve=>{child.on('error',error=>resolve({error:error.message}));child.on('exit',(exit,signal)=>resolve({exit,signal}));});
  Object.assign(record,result);sample();if(result.exit===0&&!record.error)record.result='passed';
}catch(error){stop(error);}
finally{clearInterval(timer);clearTimeout(deadline);try{sample();}catch(error){record.finalObservationError=error.message;}record.resourceResult=record.samples.length>=2&&!record.resourceErrors.length?'passed':'failed';if(record.resourceResult==='failed')record.result='failed';record.finishedAt=new Date().toISOString();save();process.exitCode=record.result==='passed'?0:1;}
