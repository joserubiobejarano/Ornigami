import { z } from "zod";
import { isCampaignLabAvailable } from "./availability.ts";
import { BRAND_FILE_BYTES, parseBrandEvidence } from "./brand-review.ts";
import { importBrandDraft, type BrandResourceReader } from "./brand-import/import-brand.ts";
import { readPublicResource } from "./brand-import/public-resource-fetch.ts";
import { createSyntheticBrandUrlReader } from "./brand-import/url-synthetic.ts";

export const BRAND_URL_API_LIMITS = Object.freeze({ bodyBytes:4096, bodyMs:2000, active:2, responseBytes:BRAND_FILE_BYTES+8192 });
export type BrandUrlEnvironment = { NODE_ENV?:string; ORNIGAMI_BRAND_URL_MODE?:string; ORNIGAMI_BRAND_URL_LIVE?:string };
export function brandUrlMode(env: BrandUrlEnvironment): "unavailable" | "off" | "synthetic" | "live" {
  if(!isCampaignLabAvailable(env.NODE_ENV))return "unavailable";
  if(env.ORNIGAMI_BRAND_URL_MODE==="synthetic")return "synthetic";
  if(env.ORNIGAMI_BRAND_URL_MODE==="live" && env.ORNIGAMI_BRAND_URL_LIVE==="true")return "live";
  return "off";
}
const requestSchema=z.strictObject({
  url:z.string().min(1).max(2048).refine(value=>{try{const u=new URL(value);return ["https:","http:"].includes(u.protocol) && !u.username && !u.password && !u.port;}catch{return false;}},"Use an HTTP(S) website URL without credentials or a custom port."),
  requestId:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
});
function json(body: unknown,status=200) {
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
class InputError extends Error { readonly status:number; constructor(status:number, message:string){super(message);this.status=status;} }
async function readInput(request: Request,signal:AbortSignal) {
  if(Number(request.headers.get("content-length"))>BRAND_URL_API_LIMITS.bodyBytes)throw new InputError(413,"The URL request is too large.");
  const reader=request.body?.getReader();if(!reader)throw new InputError(400,"Send a JSON URL request.");
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){
      if(signal.aborted)throw new InputError(408,"The URL request was cancelled or timed out.");
      const {done,value}=await reader.read();
      if(signal.aborted)throw new InputError(408,"The URL request was cancelled or timed out.");
      if(done)break;
      size+=value.byteLength;if(size>BRAND_URL_API_LIMITS.bodyBytes)throw new InputError(413,"The URL request is too large.");chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    try { return requestSchema.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))); }
    catch {throw new InputError(400,"Send only a valid HTTP(S) URL and optional requestId (80 safe characters maximum).");}
  } finally {signal.removeEventListener("abort",abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Trusted application configuration; never constructed from request fields. */
export function createBrandUrlHandler(options: { env?:BrandUrlEnvironment; reader?:()=>BrandResourceReader; bodyMs?:number }={}) {
  let active=0;
  return async function handleBrandUrl(request: Request):Promise<Response> {
    const mode=brandUrlMode(options.env ?? process.env);
    if(mode==="unavailable")return json({ok:false,message:"Campaign Lab is unavailable."},404);
    if(mode==="off")return json({ok:false,message:"Website evidence is off. Use saved evidence or manual colors."},503);
    if(request.method!=="POST")return json({ok:false,message:"Use POST."},405);
    // Next's internal Request URL may use localhost even when the browser used
    // 127.0.0.1. Compare the browser origin to the actual HTTP Host, never forwarded headers.
    const requestUrl=new URL(request.url);
    let expectedOrigin=requestUrl.origin;
    try { const host=request.headers.get("host"); if(host){const actual=new URL(`${requestUrl.protocol}//${host}`);if(actual.host!==host)throw new Error();expectedOrigin=actual.origin;} }
    catch {return json({ok:false,message:"Use the same-origin offer editor."},403);}
    if(request.headers.get("origin")!==expectedOrigin || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site")!=="same-origin"))return json({ok:false,message:"Use the same-origin offer editor."},403);
    if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return json({ok:false,message:"Use application/json."},415);
    if(active>=BRAND_URL_API_LIMITS.active)return json({ok:false,message:"Website evidence is busy. Retry after the current reads finish."},429);
    active++;
    const controller=new AbortController();const abort=()=>controller.abort();
    if(request.signal.aborted)abort();else request.signal.addEventListener("abort",abort,{once:true});
    const bodyTimer=setTimeout(abort,options.bodyMs ?? BRAND_URL_API_LIMITS.bodyMs);
    try {
      const input=await readInput(request,controller.signal);clearTimeout(bodyTimer);
      if(controller.signal.aborted)return json({ok:false,message:"Website evidence was cancelled."},408);
      const reader=options.reader?.() ?? (mode==="synthetic" ? createSyntheticBrandUrlReader().read : readPublicResource);
      const result=await importBrandDraft(input.url,reader,{resourcePolicy:"html-css",signal:controller.signal});
      const summary={status:result.ledger.status,logicalReads:result.ledger.logicalReads,chargedBytes:result.ledger.chargedBytes,retainedBytes:result.ledger.retainedBytes};
      if(!result.draft || result.ledger.status==="cancelled")return json({ok:false,message:result.ledger.status==="cancelled" ? "Website evidence was cancelled or timed out." : "The website could not supply supported HTML. Use saved evidence or manual colors.",requestId:input.requestId,summary},result.ledger.status==="cancelled" ? 408 : 422);
      const draft=result.draft;
      const failures=result.ledger.entries.filter(e=>e.error).map(e=>`${e.kind.toUpperCase()} resource unavailable: ${e.error}.`);
      draft.gaps.push(...failures);
      // The exact same schema/byte cap as saved-file review applies on both sides.
      let validated;
      try {validated=parseBrandEvidence(JSON.stringify(draft));}catch{return json({ok:false,message:"Website evidence exceeds the review limits. Use a smaller saved evidence set or manual colors."},413);}
      const payload={ok:true,draft:validated,requestId:input.requestId,summary,mode:mode==="synthetic" ? "synthetic" : "protected-text-read"};
      const bytes=new TextEncoder().encode(JSON.stringify(payload));
      if(bytes.length>BRAND_URL_API_LIMITS.responseBytes)return json({ok:false,message:"Website evidence exceeds the response limit."},413);
      return json(payload);
    } catch(error) {
      if(error instanceof InputError)return json({ok:false,message:error.message},error.status);
      return json({ok:false,message:"Website evidence could not be reviewed. Retry or use saved evidence/manual colors."},400);
    } finally {clearTimeout(bodyTimer);request.signal.removeEventListener("abort",abort);controller.abort();active--;}
  };
}
