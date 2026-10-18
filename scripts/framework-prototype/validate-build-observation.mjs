import fs from'node:fs';import{validateBuilderObservation}from'./serial-scan-driver.mjs';
try{
  const[, ,file,expected]=process.argv;
  if(!/^[0-9a-f]{64}$/.test(expected??''))throw Error('Exact owned observer container ID missing');
  const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
  if(rows.some(r=>r.containerId!==expected))throw Error('Observer container identity drift');
  validateBuilderObservation(rows.at(-1));
  console.log('status=passed; owned container/limits/OOM verified; time series retained; no headroom inferred');
}catch(error){console.error(error.message);process.exitCode=1;}
