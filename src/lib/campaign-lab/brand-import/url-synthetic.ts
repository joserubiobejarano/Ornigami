/** App-owned, deliberately synthetic HTTP streams. No DNS or OS sockets. */
import { Duplex } from "node:stream";
import type { Socket } from "node:net";
import { createPublicResourceReader } from "./public-resource-fetch.ts";

export const BRAND_URL_SYNTHETIC_HOST = "brand-url.example";
export const SYNTHETIC_HTML = `<title>UNAPPROVED synthetic source claims</title>
<style>body{background:#fff8fa;color:#1f2a24}.card{background:#f5e6ea}.overlay{background:#12345680}</style>
<link rel="stylesheet" href="/theme.png"><img src="/image.css"><link rel="icon" href="/icon">
<link rel="preload" as="font" href="/font.woff2"><script src="/script.js"></script><p>Synthetic evidence only.</p>`;
export const SYNTHETIC_CSS = `button{background:#6b2340} @font-face{font-family:NeverLoaded;src:url('/font.woff2')} @import '/recursive.css';`;
type Observation = { requests: string[]; connections: number; closed: number };
function reply(body: string, type = "text/html", status = 200, headers = "") {
  const bytes=Buffer.from(body);
  return Buffer.concat([Buffer.from(`HTTP/1.1 ${status} Synthetic\r\nContent-Type: ${type}\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n${headers}\r\n`), bytes]);
}
class SyntheticSocket extends Duplex {
  connecting=false;
  encrypted=true;
  private wire="";
  private sent=false;
  private timer?: ReturnType<typeof setTimeout>;
  private observation: Observation;
  constructor(observation: Observation) { super();this.observation=observation; observation.connections++; this.once("close",()=>{observation.closed++;if(this.timer)clearTimeout(this.timer);}); }
  _read() {}
  _write(chunk: Buffer, _encoding: string, callback: () => void) {
    this.wire+=chunk.toString();callback();
    if(this.sent || !this.wire.includes("\r\n\r\n"))return;
    this.sent=true;
    const path=/^GET ([^ ]+) HTTP/.exec(this.wire)?.[1] ?? "/missing";
    this.observation.requests.push(path);
    let response: Buffer;
    switch(path) {
      case "/rose": case "/slow": response=reply(SYNTHETIC_HTML);break;
      case "/partial": response=reply(SYNTHETIC_HTML+'<link rel="stylesheet" href="/missing.css"><link rel="stylesheet" href="https://cdn.brand-url.example/no.css">');break;
      case "/theme.png": response=reply(SYNTHETIC_CSS,"text/css");break;
      case "/misleading": response=reply('<link rel="stylesheet" href="/raster.css"><img src="/theme.png">');break;
      case "/raster.css": response=reply("not a decoded image","image/png");break;
      case "/js-only": response=reply('<div id="root"></div><script src="/script.js"></script>');break;
      case "/unsupported": response=reply("%PDF-synthetic","application/pdf");break;
      case "/redirect": response=reply("","text/plain",302,"Location: http://127.0.0.1/blocked\r\n");break;
      default: response=reply("Synthetic resource missing","text/plain",404);
    }
    const send=()=>{if(!this.destroyed){this.push(response);this.push(null);}};
    if(path==="/slow")this.timer=setTimeout(send,750);else queueMicrotask(send);
  }
}
export function createSyntheticBrandUrlReader() {
  const observation: Observation={requests:[],connections:0,closed:0};
  const connect=()=>new SyntheticSocket(observation) as unknown as Socket;
  const read=createPublicResourceReader({
    resolve:async host=>[{address:host===BRAND_URL_SYNTHETIC_HOST ? "93.184.216.34" : "127.0.0.1",family:4}],
    connectTcp:connect,connectTls:connect,
  });
  return {read,observation};
}
