import { createHash } from 'node:crypto';
import path from 'node:path';

const string = bytes => bytes.toString('utf8').replace(/\0.*$/s,'');
function numeric(bytes) {if(bytes[0]&128)throw Error('Unsupported base-256 tar number');const value=Number.parseInt(string(bytes).trim()||'0',8);if(!Number.isSafeInteger(value)||value<0)throw Error('Unsafe tar number');return value;}
export function safeImagePath(name) {const n=name.replace(/^\.\//,'');if(n.startsWith('/')||n.includes('\\')||n.split('/').includes('..')||n.includes('\0'))throw Error('Unsafe tar member path');return path.posix.normalize(n).replace(/\/$/,'');}
function pax(bytes) {
  const result={};let offset=0;
  while(offset<bytes.length){const space=bytes.indexOf(32,offset);if(space<0)throw Error('Malformed PAX length');const length=Number(bytes.subarray(offset,space).toString());if(!Number.isSafeInteger(length)||length<=space-offset+1||offset+length>bytes.length)throw Error('Invalid PAX range');const line=bytes.subarray(space+1,offset+length).toString().replace(/\n$/,'');const equal=line.indexOf('=');if(equal<1)throw Error('Malformed PAX field');result[line.slice(0,equal)]=line.slice(equal+1);offset+=length;}
  return result;
}

// Never extracts a pathname to the host. Retains only requested metadata and ELF
// bytes; hashes every regular file while streaming bounded chunks.
export async function inventoryTar(stream, onEntry, {retain=()=>false,maxRetainedFileBytes=256*1024*1024,retainELF=true,sink=()=>null}={}) {
  const iterator=stream[Symbol.asyncIterator]();let pending=Buffer.alloc(0),ended=false;
  async function take(size,allowEof=false){const parts=[];let total=0;while(total<size){if(!pending.length){const next=await iterator.next();if(next.done){ended=true;if(allowEof&&total===0)return null;throw Error('Truncated tar archive');}pending=Buffer.from(next.value);}const n=Math.min(size-total,pending.length);parts.push(pending.subarray(0,n));pending=pending.subarray(n);total+=n;}return parts.length===1?parts[0]:Buffer.concat(parts,total);}
  let global={},next={},longPath,longLink;
  while(!ended){const header=await take(512,true);if(!header||header.every(x=>x===0))break;
    const expected=numeric(header.subarray(148,156));let actual=0;for(let i=0;i<512;i++)actual+=(i>=148&&i<156)?32:header[i];if(actual!==expected)throw Error('Tar header checksum mismatch');
    const prefix=string(header.subarray(345,500)),base=string(header.subarray(0,100));let name=prefix?prefix+'/'+base:base;
    const size=numeric(header.subarray(124,136)),type=string(header.subarray(156,157))||'0';let link=string(header.subarray(157,257));
    if(['x','g','L','K'].includes(type)){
      if(size>1024*1024)throw Error('Oversized tar extension');const data=await take(size);await take((512-size%512)%512);
      if(type==='x')next=pax(data);if(type==='g')global={...global,...pax(data)};if(type==='L')longPath=string(data);if(type==='K')longLink=string(data);continue;
    }
    const attrs={...global,...next};name=safeImagePath(attrs.path??longPath??name);link=attrs.linkpath??longLink??link;next={};longPath=longLink=undefined;
    if(attrs.size!==undefined&&Number(attrs.size)!==size)throw Error('Unsupported PAX size override');
    const entry={path:name,type,size,mode:numeric(header.subarray(100,108)),uid:numeric(header.subarray(108,116)),gid:numeric(header.subarray(116,124))};
    if(type==='1'||type==='2')entry.link=type==='1'?'/'+safeImagePath(link):link;
    const hash=createHash('sha256'),chunks=[],destination=sink(entry);let remaining=size,keep=retain(entry);
    if(keep&&size>maxRetainedFileBytes)throw Error('Retained tar member exceeds byte bound');
    try{while(remaining){const data=await take(Math.min(65536,remaining));if(retainELF&&remaining===size&&data.subarray(0,4).toString('hex')==='7f454c46'){if(size>maxRetainedFileBytes)throw Error('ELF exceeds inspection bound');keep=true;}hash.update(data);destination?.write(data);if(keep)chunks.push(data);remaining-=data.length;}}finally{destination?.end();}
    await take((512-size%512)%512);
    if(type==='0')entry.sha256=hash.digest('hex');
    await onEntry(entry,keep?Buffer.concat(chunks,size):null);
  }
  // Consume/verify archive padding too, so layer diff-ID hashing and gzip CRC
  // validation cover the whole input rather than stopping at the first zero block.
  if(pending.some(x=>x!==0))throw Error('Nonzero bytes after tar terminator');
  while(!ended){const next=await iterator.next();if(next.done){ended=true;break;}if(Buffer.from(next.value).some(x=>x!==0))throw Error('Nonzero trailing tar payload');}
}

export function mergeLayer(files, entry, bytes, layer) {
  if(typeof layer!=='string'||!layer)throw Error('Explicit layer identity required');
  const name=entry.path,base=path.posix.basename(name),directory=path.posix.dirname(name);
  if(base==='.wh..wh..opq'){const prefix=directory==='.'?'':directory+'/';for(const key of files.keys())if(key.startsWith(prefix)&&key!==directory&&files.get(key).layer!==layer)files.delete(key);return;}
  if(base.startsWith('.wh.')){const target=path.posix.join(directory,base.slice(4));for(const key of files.keys())if((key===target||key.startsWith(target+'/'))&&files.get(key).layer!==layer)files.delete(key);return;}
  if(!['0','1','2','5','3','4','6'].includes(entry.type))throw Error('Unsupported tar entry type: '+entry.type);
  if(entry.type!=='5')for(const key of files.keys())if(key.startsWith(name+'/'))files.delete(key);
  files.set(name,{...entry,layer,...(bytes?{bytes}:{})});
}
