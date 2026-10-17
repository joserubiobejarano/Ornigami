import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {requireFrozenDatabase} from './frozen-db-admission.mjs';

export const requiredStages = ['original-base', 'original-runtime-base', 'build-base', 'deps', 'builder', 'prod-deps', 'runner', 'buildkit', 'dockerfile-frontend'];
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashFile(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
const save = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

// Consumes explicitly prepared Docker archives only. Never builds, pulls, runs
// containers, mutates a registry, accepts exceptions, or acknowledges custody.
async function collect(plan, planDirectory, outputDirectory, invoke, partial) {
  mkdirSync(outputDirectory); // Refuse an existing destination, including historical evidence.
  const index = {schema:1,mode:partial?'partial-single-stage; aggregate required':'complete-plan',sourceSha:plan.sourceSha,result:'failed',securityThreshold:'zero HIGH/CRITICAL at every stage; no suppression',custody:'not performed; independent later owner check',stages:[]};
  save(join(outputDirectory,'index.json'),index);
  let tool,cache,databaseSha256;
  try{
  if (plan.schema !== 1 || !/^[0-9a-f]{40}$/.test(plan.sourceSha ?? '')) throw Error('Invalid source identity');
  if (!Array.isArray(plan.images) || (partial ? plan.images.length!==1 : requiredStages.some(name => plan.images.filter(x => x.stage === name).length !== 1)) || plan.images.some(x => !/^[a-z][a-z0-9-]{0,39}$/.test(x.stage)) || new Set(plan.images.map(x => x.stage)).size !== plan.images.length) throw Error('All nine required stage/tool images (or explicit single-stage partial mode) and unique valid names are required');
  tool = resolve(planDirectory, plan.trivy.path); cache = resolve(planDirectory, plan.trivy.cacheDirectory);
  if(!plan.trivy.admissionDirectory||!plan.trivy.admissionSha256)throw Error('Single shared database admission receipt and identity are required');
  const admissionDirectory=resolve(planDirectory,plan.trivy.admissionDirectory);
  const admission=await requireFrozenDatabase({admissionDirectory,admissionSha256:plan.trivy.admissionSha256,cacheDirectory:cache,scannerPath:tool,scannerSha256:plan.trivy.sha256,sourceSha:plan.sourceSha});
  databaseSha256=admission.databaseIdentity.sha256;index.scannerBinarySha256=admission.scannerIdentity.sha256;index.databaseMetadata=admission.metadata;index.databaseSha256=databaseSha256;index.databaseAdmissionDirectory=admissionDirectory;
  }catch(error){
    index.prerequisiteFailure=true;index.error=error.message;
    index.stages=(Array.isArray(plan.images)?plan.images:[]).map(x=>({stage:x.stage,result:'skipped',prerequisiteFailure:true,error:error.message,reason:'shared admission failed; scanner not invoked'}));
    save(join(outputDirectory,'index.json'),index);throw error;
  }
  const ignorefile = join(outputDirectory, 'empty-ignorefile'); writeFileSync(ignorefile, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TRIVY_')));
  save(join(outputDirectory, 'index.json'), index);
  for (const stage of plan.images.map(x => x.stage)) {
    const item = plan.images.find(x => x.stage === stage), record = { stage, result: 'failed', coverage: 'unverified' };
    index.stages.push(record);
    const folder = join(outputDirectory, stage); mkdirSync(folder);
    try {
      try{await requireFrozenDatabase({admissionDirectory:resolve(planDirectory,plan.trivy.admissionDirectory),admissionSha256:plan.trivy.admissionSha256,cacheDirectory:cache,scannerPath:tool,scannerSha256:plan.trivy.sha256,sourceSha:plan.sourceSha});}
      catch(error){record.prerequisiteFailure=true;throw error;}
      if (!/^[0-9a-f]{64}$/.test(item.archiveSha256 ?? '') || !/^sha256:[0-9a-f]{64}$/.test(item.imageId ?? '')) throw Error('Archive/image identity missing');
      const archive = resolve(planDirectory, item.archive);
      record.archiveSha256 = await hashFile(archive);
      if (record.archiveSha256 !== item.archiveSha256) throw Error('Archive checksum mismatch');
      // Docker archive identity binds the exact config and platform, not its tag.
      const extract = entry => {
        const result = invoke('tar', ['-xOf', archive, entry], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30_000, windowsHide: true });
        if (result.status !== 0) throw Error('Docker archive metadata extraction failed');
        return result.stdout;
      };
      const manifests = JSON.parse(extract('manifest.json'));
      if (!Array.isArray(manifests) || manifests.length !== 1) throw Error('Expected single-image Docker archive');
      const configPath = manifests[0].Config;
      if (typeof configPath !== 'string' || !/^(?:blobs\/sha256\/)?[0-9a-f]{64}(?:\.json)?$/.test(configPath)) throw Error('Unsafe config member');
      const rawConfig = extract(configPath), config = JSON.parse(rawConfig);
      record.imageId = 'sha256:' + hashBytes(rawConfig);
      if (record.imageId !== item.imageId || config.architecture !== 'amd64' || config.os !== 'linux') throw Error('Config/platform identity mismatch');
      if (['builder', 'runner'].includes(stage) && config.config?.Labels?.['org.opencontainers.image.revision'] !== plan.sourceSha) throw Error('Source revision label missing/mismatched');
      save(join(folder, 'image-identity.json'), { imageId: record.imageId, platform: 'linux/amd64', sourceRevision: config.config?.Labels?.['org.opencontainers.image.revision'] ?? null, archiveSha256: record.archiveSha256 });
      const reportPath = join(folder, 'trivy.json');
      const args = ['image', '--input', archive, '--cache-dir', cache, '--skip-db-update', '--skip-java-db-update', '--scanners', 'vuln', '--pkg-types', 'os,library', '--list-all-pkgs', '--ignore-unfixed=false', '--severity', 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL', '--ignorefile', ignorefile, '--format', 'json', '--exit-code', '0', '--no-progress', '--output', reportPath];
      save(join(folder, 'scanner-arguments.json'), args);
      const result = invoke(tool, args, { cwd: outputDirectory, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
      record.scannerExit = result.status;
      writeFileSync(join(folder, 'scanner.log'), (result.stdout ?? '') + (result.stderr ?? ''));
      try{if(await hashFile(join(cache,'db/trivy.db'))!==databaseSha256)throw Error('content changed');}
      catch(error){index.databaseChanged=true;record.prerequisiteFailure=true;throw Error('Frozen database unavailable/changed during scan; stop dependent roles: '+error.message);}
      if (result.status !== 0 || !existsSync(reportPath)) throw Error('Scanner failed or report absent');
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      if(report.SchemaVersion!==2||report.ArtifactType!=='container_image'||report.Metadata?.ImageID!==item.imageId)throw Error('Scanner schema/artifact/image identity mismatch');
      const results = report.Results ?? [];
      const packages = results.flatMap(r => (r.Packages ?? []).map(p => ({ target: r.Target, class: r.Class, type: r.Type, ...p })));
      save(join(folder, 'package-inventory.json'), packages);
      record.packageCount = packages.length;
      record.counts = {};
      for (const r of results) for (const v of r.Vulnerabilities ?? []) record.counts[v.Severity] = (record.counts[v.Severity] ?? 0) + 1;
      let provenScratch=false;
      if(stage==='dockerfile-frontend'&&item.filesystemReceipt&&item.filesystemReceiptSha256){
        const receipt=resolve(planDirectory,item.filesystemReceipt),bytes=readFileSync(receipt);
        if(hashBytes(bytes)!==item.filesystemReceiptSha256)throw Error('Filesystem receipt digest mismatch');
        const metadata=JSON.parse(bytes);
        const goTargets=results.filter(r=>r.Type==='gobinary'&&r.Packages?.length).map(r=>r.Target.replace(/^\.?\//,'')).sort();
        provenScratch=metadata.result==='passed'&&metadata.imageId===item.imageId&&metadata.hasOsPackageDatabase===false&&metadata.nativeFiles>0&&JSON.stringify(metadata.nativePaths)===JSON.stringify(goTargets);
      }
      if (!packages.length || (!results.some(r => r.Class === 'os-pkgs' && r.Packages?.length)&&!provenScratch)) throw Error('Missing complete OS package inventory or proven bare-Go frontend coverage');
      record.osCoverage=provenScratch?'No OS database in complete hash-bound filesystem; native closure and Go binary package inventory required':'OS package inventory present';
      const npmPackages = packages.filter(p => /(?:^|\/)opt\/ornigami-npm\//.test(p.FilePath ?? ''));
      if (['build-base', 'deps', 'builder', 'prod-deps'].includes(stage) && (!npmPackages.length || !npmPackages.some(p => p.Name === 'npm' && p.Version === '11.21.1'))) throw Error('Upgraded npm tree/root version not inventoried');
      record.upgradedNpmPackageCount = npmPackages.length;
      record.coverage = 'complete reported OS/library inventory; not proof of every embedded binary';
      record.result = (record.counts.CRITICAL ?? 0) || (record.counts.HIGH ?? 0) ? 'failed-security-threshold' : 'passed';
    } catch (error) { record.error = error.message; }
    save(join(outputDirectory, 'index.json'), index); // Keep every preceding result if interrupted.
    if(record.prerequisiteFailure){for(const remaining of plan.images.slice(index.stages.length))index.stages.push({stage:remaining.stage,result:'skipped',prerequisiteFailure:true,reason:'prior shared prerequisite failed; scanner not invoked'});break;}
  }
  try{if(await hashFile(join(cache,'db/trivy.db'))!==databaseSha256)index.databaseChanged=true;}
  catch(error){index.databaseChanged=true;index.prerequisiteFailure=true;index.error='Frozen database unavailable after scan: '+error.message;}
  index.result = !index.databaseChanged && index.stages.every(x => x.result === 'passed') ? 'passed' : 'failed';
  save(join(outputDirectory, 'index.json'), index);
  return index;
}

export async function scanStages(plan,planDirectory,outputDirectory,invoke=spawnSync){return collect(plan,planDirectory,outputDirectory,invoke,false);}
export async function scanOneStage(plan,planDirectory,outputDirectory,invoke=spawnSync){return collect(plan,planDirectory,outputDirectory,invoke,true);}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , planFile, output, mode] = process.argv;
    if (!planFile || !output) throw Error('Usage: node scan-image-stages.mjs PLAN.json NEW_OUTPUT_DIRECTORY');
    if(mode&&mode!=='--single')throw Error('Unknown collection mode');
    const result = await (mode?scanOneStage:scanStages)(JSON.parse(readFileSync(planFile, 'utf8')), dirname(resolve(planFile)), resolve(output));
    console.log(JSON.stringify(result)); process.exitCode = result.result === 'passed' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
