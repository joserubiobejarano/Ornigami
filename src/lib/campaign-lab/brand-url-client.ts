import { z } from "zod";
import { BRAND_FILE_BYTES, BrandEvidenceFileReader, parseBrandEvidence } from "./brand-review.ts";
import type { BrandKitDraft } from "./brand-import/evidence-types.ts";
const RESPONSE_BYTES=BRAND_FILE_BYTES+8192;
const envelope=z.strictObject({ok:z.literal(true),draft:z.unknown(),requestId:z.string(),mode:z.enum(["synthetic","protected-text-read"]),summary:z.strictObject({status:z.enum(["complete","partial","incomplete","rejected"]),logicalReads:z.number().int().min(0).max(4),chargedBytes:z.number().int().min(0).max(1024*1024),retainedBytes:z.number().int().min(0).max(1024*1024)})});
export type EvidenceSelectionResult = {stale:true} | {stale:false;draft?:BrandKitDraft;error?:string;notice?:string};
async function responseText(response:Response,signal:AbortSignal) {
  if(Number(response.headers.get("content-length"))>RESPONSE_BYTES)throw new Error("Website evidence exceeds the response limit.");
  if(response.headers.get("content-type")?.split(";")[0]!=="application/json")throw new Error("Website evidence is unavailable. Use saved evidence or manual colors.");
  const reader=response.body?.getReader();if(!reader)throw new Error("No website evidence returned.");
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  let total=0;const chunks:Uint8Array[]=[];
  try {
    while(true){if(signal.aborted)throw new Error("Website evidence was cancelled or timed out.");const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>RESPONSE_BYTES)throw new Error("Website evidence exceeds the response limit.");chunks.push(value);}
    const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  } finally {signal.removeEventListener("abort",abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Single authority shared by file reads, URL reads, edits, cancellation and unmount. */
export class BrandEvidenceSelection {
  private sequence=0;
  private fileReader=new BrandEvidenceFileReader();
  private controller?:AbortController;
  cancel(){this.sequence++;this.fileReader.cancel();this.controller?.abort();}
  async file(file?:{size:number;text():Promise<string>}):Promise<EvidenceSelectionResult>{
    this.cancel();const ticket=this.sequence;const result=await this.fileReader.read(file);
    return ticket===this.sequence ? result : {stale:true};
  }
  async url(url:string,fetcher:typeof fetch=fetch):Promise<EvidenceSelectionResult>{
    this.cancel();const ticket=this.sequence;const controller=new AbortController();this.controller=controller;
    const timer=setTimeout(()=>controller.abort(),15_000);
    try{
      const response=await fetcher("/api/campaign-lab/brand-evidence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,requestId:String(ticket)}),signal:controller.signal});
      const raw=JSON.parse(await responseText(response,controller.signal));
      if(!response.ok){const message=typeof raw?.message==="string" && raw.message.length<240 ? raw.message : "Website evidence is unavailable. Retry or use saved evidence/manual colors.";throw new Error(message);}
      const data=envelope.parse(raw);if(data.requestId!==String(ticket))throw new Error("Outdated website evidence response. Retry the URL.");
      const draft=parseBrandEvidence(JSON.stringify(data.draft));
      if(ticket!==this.sequence || controller.signal.aborted)return {stale:true};
      return {stale:false,draft,notice:`${data.mode==="synthetic" ? "Synthetic evidence — no website was contacted. " : "Protected HTML/CSS evidence. "}${data.summary.status}. Review colors before applying.`};
    } catch(e){
      if(ticket!==this.sequence)return {stale:true};
      return {stale:false,error:controller.signal.aborted ? "Website evidence was cancelled or timed out." : e instanceof Error && !e.message.startsWith("[") ? e.message : "Invalid website evidence response. Use saved evidence or manual colors."};
    } finally {clearTimeout(timer);if(ticket===this.sequence)this.controller=undefined;}
  }
}
