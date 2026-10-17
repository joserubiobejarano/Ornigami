import fs from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const cgroupKeys = ['memory.max', 'memory.swap.max', 'memory.current', 'memory.peak', 'memory.events', 'memory.stat', 'memory.pressure', 'cpu.max', 'cpu.stat', 'pids.max'];
export function cgroupSnapshot(read = key => fs.readFileSync('/sys/fs/cgroup/' + key, 'utf8')) {
  return cgroupKeys.map(key => {
    const value = read(key).trim();
    if (!value) throw Error(`Empty required cgroup metric: ${key}`);
    return `==${key}==\n${value}\n`;
  }).join('');
}
export function identity({ uid = process.getuid?.(), gid = process.getgid?.() } = {}) {
  if (uid !== 1000 || gid !== 1000) throw Error('Runtime UID/GID must remain 1000:1000');
  return String(uid);
}
export function diskUsage(stat = path => fs.statfsSync(path, { bigint: true })) {
  return ['/','/tmp','/app/.next/cache'].map(path => {
    const s = stat(path);
    return {path,blockSize:String(s.bsize),totalBytes:String(s.bsize*s.blocks),freeBytes:String(s.bsize*s.bfree),availableBytes:String(s.bsize*s.bavail)};
  });
}
export async function imageFormats(sharp) {
  const checks = [];
  for (const format of ['png','jpeg','webp','avif','gif','tiff']) {
    const capability=sharp.format[format==='avif'?'heif':format];
    if (!capability?.input?.buffer || !capability?.output?.buffer || (format==='avif'&&!capability.output.alias?.includes('avif'))) throw Error(`Required native image format unavailable: ${format}`);
    const input = await sharp({create:{width:8,height:8,channels:4,background:{r:23,g:47,b:89,alpha:1}}}).toFormat(format).toBuffer();
    if(format==='avif'){const metadata=await sharp(input).metadata();if(metadata.format!=='heif'||metadata.compression!=='av1')throw Error('AVIF encoding did not produce AV1 in HEIF');}
    const {data,info} = await sharp(input).resize(4,4).webp().toBuffer({resolveWithObject:true});
    if (info.width !== 4 || info.height !== 4 || info.format !== 'webp' || !data.length) throw Error(`Image transform failed: ${format}`);
    checks.push({format,inputBytes:input.length,outputBytes:data.length,width:info.width,height:info.height,result:'passed'});
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#172f59"/></svg>');
  const {data,info} = await sharp(svg).resize(4,4).png().toBuffer({resolveWithObject:true});
  if (!data.length || info.width !== 4 || info.height !== 4 || info.format !== 'png') throw Error('Required SVG-input transform failed');
  checks.push({format:'svg-input',inputBytes:svg.length,outputBytes:data.length,result:'passed'});
  return {result:'passed',versions:sharp.versions,checks};
}
export function runtimePlatform({platform=process.platform,arch=process.arch,node=process.version,openssl=process.versions.openssl,glibc,flags}={}){
  if(platform!=='linux'||arch!=='x64'||node!=='v22.23.3'||openssl!=='3.5.8'||!glibc||!flags?.split(/\s+/).includes('sse4_2'))throw Error('Unreviewed Linux/amd64 Node/OpenSSL/glibc/SSE4.2 runtime');
  return{platform:'linux/amd64',node,openssl,glibc,sse4_2:true};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (command === 'cgroup') process.stdout.write(cgroupSnapshot());
    else if (command === 'uid') process.stdout.write(identity());
    else if (command === 'disk') console.log(JSON.stringify(diskUsage()));
    else if (command === 'image-formats') {const report=process.report.getReport(),runtime=runtimePlatform({glibc:report.header.glibcVersionRuntime,flags:fs.readFileSync('/proc/cpuinfo','utf8')});const {default:sharp}=await import('sharp');console.log(JSON.stringify({...await imageFormats(sharp),runtime,loadedNativeObjects:process.report.getReport().sharedObjects}));}
    else throw Error('Expected cgroup, uid, disk or image-formats');
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
