import path from 'node:path';
import {inflateSync} from 'node:zlib';

// Compiler startup/link inputs have sections and relocations, not a process
// image. Keep this separate from the unchanged executable dependency checker.
// ELF gABI: https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.sheader.html
export function inspectRelocatableElf(bytes) {
  if(bytes.length<64||bytes.length>64*1024*1024||bytes.subarray(0,4).toString('hex')!=='7f454c46'||bytes[4]!==2||bytes[5]!==1||bytes[6]!==1||![0,3].includes(bytes[7])||bytes.readUInt16LE(16)!==1||bytes.readUInt16LE(18)!==62||bytes.readUInt32LE(20)!==1||bytes.readUInt16LE(52)!==64)throw Error('Expected bounded Linux amd64 ELF64 ET_REL link object');
  const u64=at=>{const n=bytes.readBigUInt64LE(at);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Link object integer exceeds bounds');return Number(n);};
  const bounded=(offset,size)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset>bytes.length-size)throw Error('Link object section range out of bounds');};
  if(u64(24)!==0||u64(32)!==0||bytes.readUInt16LE(54)!==0||bytes.readUInt16LE(56)!==0)throw Error('Link object must have no entry point or program headers');
  const offset=u64(40),entrySize=bytes.readUInt16LE(58),count=bytes.readUInt16LE(60),names=bytes.readUInt16LE(62);
  if(offset<64||entrySize!==64||count<1||count>4096||names>=count)throw Error('Invalid link object section table');bounded(offset,entrySize*count);
  const sections=[];
  for(let index=0;index<count;index++){
    const at=offset+index*entrySize,s={index,name:bytes.readUInt32LE(at),type:bytes.readUInt32LE(at+4),flags:u64(at+8),offset:u64(at+24),size:u64(at+32),link:bytes.readUInt32LE(at+40),info:bytes.readUInt32LE(at+44),align:u64(at+48),entrySize:u64(at+56)};
    if(index===0){if(s.type!==0||s.size!==0)throw Error('Unsupported extended/null section');sections.push(s);continue;}
    if(s.link>=count||(s.flags&64)&&s.info>=count||s.align>1&&(BigInt(s.align)&BigInt(s.align-1))!==0n||s.entrySize&&s.size%s.entrySize)throw Error('Invalid link object section alignment/index/entry size');
    if([6,11,18].includes(s.type))throw Error('Unsupported dynamic/extended link object section');
    if(s.type!==8){bounded(s.offset,s.size);if(s.size&&(s.offset<64||s.offset<offset+entrySize*count&&s.offset+s.size>offset))throw Error('Link object section overlaps headers');}
    s.logicalSize=s.size;
    if(s.flags&0x800){
      if(s.type!==1||(s.flags&2)||s.size<24||bytes.readUInt32LE(s.offset)!==1||bytes.readUInt32LE(s.offset+4)!==0)throw Error('Unsupported compressed link object section');
      const logical=u64(s.offset+8),alignment=u64(s.offset+16);
      if(logical>64*1024*1024||alignment>1&&(BigInt(alignment)&BigInt(alignment-1))!==0n)throw Error('Compressed link object section bound/alignment invalid');
      const expanded=inflateSync(bytes.subarray(s.offset+24,s.offset+s.size),{maxOutputLength:64*1024*1024});
      if(expanded.length!==logical)throw Error('Compressed link object section size mismatch');s.logicalSize=logical;
    }
    sections.push(s);
  }
  const occupied=sections.filter(s=>s.type!==0&&s.type!==8&&s.size).sort((a,b)=>a.offset-b.offset);
  for(let i=1;i<occupied.length;i++)if(occupied[i].offset<occupied[i-1].offset+occupied[i-1].size)throw Error('Overlapping link object sections');
  const strings=new Map();
  function string(table,index){
    if(table?.type!==3||index>=table.size)throw Error('Link object string index invalid');const key=table.index+':'+index;if(strings.has(key))return;
    const end=bytes.indexOf(0,table.offset+index);if(end<0||end>=table.offset+table.size)throw Error('Unterminated link object string');strings.set(key,true);
  }
  if(names){for(const section of sections)string(sections[names],section.name);}
  let symbols=0,symbolTables=0,relocations=0;
  for(const s of sections.filter(s=>s.type===2)){
    if(s.entrySize!==24||s.size%24||s.info>s.size/24||sections[s.link]?.type!==3)throw Error('Invalid link object symbol table');
    symbols+=s.size/24;if(symbols>1000000)throw Error('Link object symbol bound');symbolTables++;
    for(let at=s.offset;at<s.offset+s.size;at+=24){string(sections[s.link],bytes.readUInt32LE(at));const index=bytes.readUInt16LE(at+6);if(index>=count&&![0xfff1,0xfff2].includes(index))throw Error('Invalid link object symbol section');}
  }
  for(const s of sections.filter(s=>s.type===4||s.type===9)){
    const size=s.type===4?24:16,symtab=sections[s.link],target=sections[s.info];
    if(s.entrySize!==size||s.size%size||symtab?.type!==2||!target||!s.info)throw Error('Invalid link object relocation table');
    relocations+=s.size/size;if(relocations>1000000)throw Error('Link object relocation bound');
    for(let at=s.offset;at<s.offset+s.size;at+=size){const symbol=Number(bytes.readBigUInt64LE(at+8)>>32n);if(symbol>=symtab.size/24||u64(at)>target.logicalSize)throw Error('Link object relocation symbol/offset out of bounds');}
  }
  return {machine:'amd64',type:'ET_REL',sections:count,symbolTables,symbols,relocations,compressedSections:sections.filter(s=>s.flags&0x800).length};
}

export function inspectElf(bytes) {
  if (bytes.subarray(0,4).toString('hex') !== '7f454c46') return null;
  if (bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== 62) throw Error('Only Linux amd64 ELF64 little-endian is admitted');
  const number = n => {if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('ELF integer exceeds safe bounds');return Number(n);};
  const u64 = offset => number(bytes.readBigUInt64LE(offset));
  const bounded = (offset,size) => {if(offset<0||size<0||offset+size>bytes.length)throw Error('ELF range out of bounds');};
  const phoff=u64(32), phsize=bytes.readUInt16LE(54), count=bytes.readUInt16LE(56), loads=[];let dynamic,interpreter=null;
  if(phsize<56||count>4096)throw Error('Malformed ELF program headers');bounded(phoff,phsize*count);
  for(let i=0;i<count;i++){
    const at=phoff+i*phsize,type=bytes.readUInt32LE(at),offset=u64(at+8),vaddr=u64(at+16),size=u64(at+32);bounded(offset,size);
    if(type===1)loads.push({offset,vaddr,size});
    if(type===2)dynamic={offset,size};
    if(type===3){bounded(offset,size);interpreter=bytes.subarray(offset,offset+size).toString().replace(/\0.*$/s,'');}
  }
  const address=v=>{const p=loads.find(x=>v>=x.vaddr&&v<x.vaddr+x.size);if(!p)throw Error('Unmapped ELF virtual address');return p.offset+v-p.vaddr;};
  const tags=new Map();
  if(dynamic)for(let at=dynamic.offset;at+16<=dynamic.offset+dynamic.size;at+=16){const tag=u64(at),value=u64(at+8);if(!tag)break;tags.set(tag,[...(tags.get(tag)??[]),value]);}
  const first=tag=>tags.get(tag)?.[0];
  if(!tags.size)return {machine:'amd64',interpreter,needed:[],rpath:[],runpath:[],soname:null,requiredVersions:{},providedVersions:[]};
  if(first(5)===undefined||first(10)===undefined)throw Error('ELF dynamic string table missing');
  const strings=address(first(5)),stringSize=first(10);bounded(strings,stringSize);
  const str=offset=>{if(offset>=stringSize)throw Error('ELF string offset invalid');const start=strings+offset,end=bytes.indexOf(0,start);if(end<start||end>=strings+stringSize)throw Error('ELF string unterminated');return bytes.subarray(start,end).toString();};
  const requiredVersions={},providedVersions=[];
  if(first(0x6ffffffe)!==undefined){let at=address(first(0x6ffffffe));const n=first(0x6fffffff)??0;if(n>4096)throw Error('Too many version requirements');
    for(let i=0;i<n;i++){bounded(at,16);const lib=str(bytes.readUInt32LE(at+4)),cnt=bytes.readUInt16LE(at+2);let aux=at+bytes.readUInt32LE(at+8);requiredVersions[lib]=[];if(cnt>4096)throw Error('Too many required versions');
      for(let j=0;j<cnt;j++){bounded(aux,16);requiredVersions[lib].push(str(bytes.readUInt32LE(aux+8)));const next=bytes.readUInt32LE(aux+12);if(j+1<cnt&&!next)throw Error('Broken ELF version chain');aux+=next;}
      const next=bytes.readUInt32LE(at+12);if(i+1<n&&!next)throw Error('Broken ELF dependency version chain');at+=next;
    }
  }
  if(first(0x6ffffffc)!==undefined){let at=address(first(0x6ffffffc));const n=first(0x6ffffffd)??0;if(n>4096)throw Error('Too many version definitions');
    for(let i=0;i<n;i++){bounded(at,20);const aux=at+bytes.readUInt32LE(at+12);bounded(aux,8);providedVersions.push(str(bytes.readUInt32LE(aux)));const next=bytes.readUInt32LE(at+16);if(i+1<n&&!next)throw Error('Broken ELF definition chain');at+=next;}
  }
  return {machine:'amd64',interpreter,needed:(tags.get(1)??[]).map(str),rpath:(first(15)===undefined?'':str(first(15))).split(':').filter(Boolean),runpath:(first(29)===undefined?'':str(first(29))).split(':').filter(Boolean),soname:first(14)===undefined?null:str(first(14)),requiredVersions,providedVersions};
}

export function resolveImagePath(files, requested) {
  let name=path.posix.resolve('/',requested).slice(1);
  for(let hops=0;hops<40;hops++){
    const parts=name.split('/');let replaced=false;
    for(let i=0;i<parts.length;i++){
      const prefix=parts.slice(0,i+1).join('/'),entry=files.get(prefix);
      if(entry?.link){name=path.posix.resolve('/',path.posix.dirname(prefix),entry.link,...parts.slice(i+1)).slice(1);replaced=true;break;}
    }
    if(!replaced)return files.has(name)?name:null;
  }
  throw Error('Image symlink cycle');
}

export function verifyClosure(files, roots) {
  const nodes={},errors=[],queue=[...roots],visited=new Set();
  while(queue.length){const requested=queue.shift(),file=resolveImagePath(files,requested);if(!file){errors.push({file:requested,error:'missing ELF root/provider'});continue;}if(visited.has(file))continue;visited.add(file);
    let elf;try{elf=inspectElf(files.get(file).bytes??Buffer.alloc(0));}catch(error){errors.push({file,error:error.message});continue;}
    if(!elf){errors.push({file,error:'expected ELF bytes unavailable'});continue;}nodes[file]=elf;
    if(elf.interpreter){const loader=resolveImagePath(files,elf.interpreter);if(!loader)errors.push({file,error:'missing interpreter',interpreter:elf.interpreter});else queue.push(loader);}
    const origin='/'+path.posix.dirname(file),directories=[...elf.rpath,...elf.runpath].map(x=>x.replaceAll('${ORIGIN}',origin).replaceAll('$ORIGIN',origin));
    if(directories.some(x=>!x.startsWith('/')||x.includes('$'))) {errors.push({file,error:'unsupported relative/token library search path'});continue;}
    directories.push('/lib/x86_64-linux-gnu','/usr/lib/x86_64-linux-gnu','/lib64','/usr/lib64','/lib','/usr/lib');
    for(const library of elf.needed){
      const provider=library.includes('/')?resolveImagePath(files,library):directories.map(dir=>resolveImagePath(files,path.posix.join(dir,library))).find(Boolean);
      if(!provider){errors.push({file,library,error:'unresolved DT_NEEDED'});continue;}queue.push(provider);
      const required=elf.requiredVersions[library]??[];try{const versions=inspectElf(files.get(provider).bytes??Buffer.alloc(0))?.providedVersions??[];for(const version of required)if(!versions.includes(version))errors.push({file,library,provider,version,error:'required symbol version absent'});}catch(error){errors.push({file,provider,error:error.message});}
    }
  }
  return {result:errors.length?'failed':'passed',roots,nodes,errors,scope:'Static ELF/interpreter/DT_NEEDED/symbol-version closure only; no Linux dlopen, CPU, image codec, TLS/DNS or runtime execution proof'};
}
