import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonicalJSON(value) {
  if (Array.isArray(value)) return '['+value.map(canonicalJSON).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function contractDigest(contract) { return sha256(Buffer.from(canonicalJSON(contract))); }

// Small deterministic USTAR writer for generated metadata and one frontend
// binary. It never extracts an archive or accepts arbitrary filesystem paths.
export function toolTar(entries) {
  let total=1024; const chunks=[];
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9_.\-/]+$/.test(entry.name) || entry.name.startsWith('/') || entry.name.split('/').some(x=>x==='..'||x==='')) throw Error('Unsafe generated tar path');
    const name=Buffer.from(entry.name); if(name.length>100)throw Error('USTAR name too long');
    const bytes=Buffer.from(entry.bytes), header=Buffer.alloc(512);
    name.copy(header); const octal=(at,length,value)=>{
      const text=value.toString(8); if(text.length>length-1)throw Error('USTAR field overflow');
      header.write(text.padStart(length-1,'0')+'\0',at,length,'ascii');
    };
    octal(100,8,entry.mode??0o644);octal(108,8,0);octal(116,8,0);octal(124,12,bytes.length);octal(136,12,0);
    header.fill(32,148,156);header[156]=48;header.write('ustar\0',257,6,'ascii');header.write('00',263,2,'ascii');
    header.write([...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
    const padding=Buffer.alloc((512-bytes.length%512)%512);chunks.push(header,bytes,padding);total+=512+bytes.length+padding.length;
    if(total>128*1024*1024)throw Error('Generated frontend tar exceeds bound');
  }
  chunks.push(Buffer.alloc(1024));return Buffer.concat(chunks,total);
}

export function frontendImage(binary, contract, repoTag) {
  if (binary.length<64 || binary.length>64*1024*1024 || binary.subarray(0,4).toString('hex')!=='7f454c46' || binary[4]!==2 || binary[5]!==1 || binary[6]!==1 || binary.readUInt16LE(18)!==62) throw Error('Expected bounded Linux amd64 ELF frontend');
  if (!/^ornigami-tool-frontend:[a-zA-Z0-9_.-]+$/.test(repoTag)) throw Error('Unexpected local-only frontend tag');
  const layer=toolTar([{name:'bin/dockerfile-frontend',bytes:binary,mode:0o755}]), layerDigest='sha256:'+sha256(layer);
  const config=Buffer.from(canonicalJSON({architecture:'amd64',os:'linux',created:contract.sourceDate,
    config:{Entrypoint:['/bin/dockerfile-frontend'],Labels:{
      'org.opencontainers.image.source':'https://github.com/moby/buildkit',
      'org.opencontainers.image.revision':contract.sources.buildkit.commit,
      'org.ornigami.experimental-toolchain':contractDigest(contract),
      'moby.buildkit.frontend.network.none':'true',
      'moby.buildkit.frontend.caps':'moby.buildkit.frontend.inputs,moby.buildkit.frontend.subrequests,moby.buildkit.frontend.contexts,moby.buildkit.frontend.gitquerystring,moby.buildkit.frontend.contexts.zstd',
    }},rootfs:{type:'layers',diff_ids:[layerDigest]},history:[{created:contract.sourceDate,created_by:'Ornigami experimental pinned-source frontend assembly; not an official image'}]}));
  const configDigest='sha256:'+sha256(config),manifest=Buffer.from(canonicalJSON({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{mediaType:'application/vnd.oci.image.config.v1+json',digest:configDigest,size:config.length},layers:[{mediaType:'application/vnd.oci.image.layer.v1.tar',digest:layerDigest,size:layer.length}]}));
  const dockerManifest=Buffer.from(JSON.stringify([{Config:sha256(config)+'.json',RepoTags:[repoTag],Layers:['layer.tar']}]));
  const archive=toolTar([{name:sha256(config)+'.json',bytes:config},{name:'manifest.json',bytes:dockerManifest},{name:'layer.tar',bytes:layer}]);
  return {binarySha256:sha256(binary),config,configDigest,layer,layerDigest,manifest,manifestDigest:'sha256:'+sha256(manifest),archive,archiveSha256:sha256(archive),repoTag};
}
export function writeFrontendImage(binary, contract, outputDirectory, repoTag) {
  const image=frontendImage(binary,contract,repoTag);fs.mkdirSync(outputDirectory);
  const blobs=path.join(outputDirectory,'oci','blobs','sha256');fs.mkdirSync(blobs,{recursive:true});
  for(const bytes of [image.config,image.layer,image.manifest])fs.writeFileSync(path.join(blobs,sha256(bytes)),bytes,{flag:'wx'});
  fs.writeFileSync(path.join(outputDirectory,'oci','oci-layout'),'{"imageLayoutVersion":"1.0.0"}\n',{flag:'wx'});
  fs.writeFileSync(path.join(outputDirectory,'oci','index.json'),canonicalJSON({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[{mediaType:'application/vnd.oci.image.manifest.v1+json',digest:image.manifestDigest,size:image.manifest.length,platform:{architecture:'amd64',os:'linux'}}]})+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(outputDirectory,'image.tar'),image.archive,{flag:'wx'});
  return image;
}
