import fs from 'node:fs';import path from 'node:path';import{spawnSync}from'node:child_process';
const[, ,receipt,executable,...args]=process.argv;
const file=path.resolve(receipt);let cgroup;
const metrics=['memory.max','memory.swap.max','memory.current','memory.peak','memory.events','memory.stat','memory.pressure','cpu.max','cpu.stat','pids.current','pids.max'];
function snapshot(){if(!cgroup){const line=fs.readFileSync('/proc/self/cgroup','utf8').split('\n').find(x=>x.startsWith('0::'));if(!line)throw Error('Unified cgroup missing');cgroup=path.join('/sys/fs/cgroup',line.slice(3));}return Object.fromEntries(metrics.map(k=>[k,fs.readFileSync(path.join(cgroup,k),'utf8').trim()]));}
const record={startedAt:new Date().toISOString(),result:'failed',resourceResult:'failed',command:path.basename(executable),arguments:args};
function save(){fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');}
try{
  record.before=snapshot();save();if(record.before['memory.max']!=='2147483648'||record.before['memory.swap.max']!=='0'||record.before['cpu.max']!=='100000 100000')throw Error('Scan cgroup must be 2 GiB/1 CPU/zero swap');
  record.limitsVerified=true;
  const result=spawnSync(executable,args,{stdio:'inherit',timeout:180000,windowsHide:true});record.exit=result.status;record.signal=result.signal;record.error=result.error?.message;
  if(result.status!==0)throw Error('Bounded scan command failed');record.result='passed';
}catch(error){record.error=error.message;process.exitCode=1;}
finally{
  try{record.after=snapshot();const events=Object.fromEntries(record.after['memory.events'].split('\n').map(x=>x.split(/\s+/)));if(!record.limitsVerified||record.after['memory.max']!=='2147483648'||record.after['memory.swap.max']!=='0'||record.after['cpu.max']!=='100000 100000'||['oom','oom_kill','oom_group_kill'].some(k=>events[k]!=='0')){record.result='failed';record.error='Scan limits drifted or OOM counters nonzero';process.exitCode=1;}else record.resourceResult='passed';}catch(error){record.counterError=error.message;record.result='failed';process.exitCode=1;}
  record.finishedAt=new Date().toISOString();save();
}
