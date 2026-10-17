import fs from'node:fs';import{spawnSync}from'node:child_process';import{freemem}from'node:os';
const[, ,container,out,stop]=process.argv;if(!/^[0-9a-f]{64}$/.test(container??''))throw Error('Exact owned container ID required');
if(process.argv[5]&&process.argv[5]!=='toolchain')throw Error('Unknown owned observation purpose');
const observationScope=process.argv[5]==='toolchain'?'owned toolchain compiler PID namespace only; no arguments or environment collected':'owned BuildKit PID namespace only; no arguments or environment collected';
const keys='memory.max memory.swap.max memory.current memory.peak memory.events memory.events.local memory.stat memory.pressure cpu.max cpu.stat pids.current pids.max';
const script=`for k in ${keys}; do printf '==%s==\\n' "$k"; cat "/sys/fs/cgroup/$k" || exit 1; done; printf '==owned-process-memory==\\n'; for p in /proc/[0-9]*; do [ -r "$p/status" ] || continue; grep -E '^(Name|Pid|PPid|VmRSS|VmHWM|Threads):' "$p/status"; if [ -r "$p/smaps_rollup" ]; then grep -E '^(Rss|Pss|Private_Clean|Private_Dirty):' "$p/smaps_rollup"; fi; done`;
const started=Date.now();let sequence=0;
do{
  const final=fs.existsSync(stop);
  const result=spawnSync('docker',['exec',container,'sh','-c',script],{encoding:'utf8',timeout:1800,maxBuffer:1024*1024});
  fs.appendFileSync(out,JSON.stringify({at:new Date().toISOString(),sequence:sequence++,containerId:container,final,hostAvailableBytes:freemem(),exit:result.status,signal:result.signal,metrics:result.stdout??'',error:result.stderr??result.error?.message??'',scope:observationScope})+'\n');
  if(final)break;if(!fs.existsSync(stop))await new Promise(r=>setTimeout(r,2000));
}while(Date.now()-started<24*60*1000);
