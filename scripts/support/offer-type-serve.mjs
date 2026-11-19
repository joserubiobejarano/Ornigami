// Loopback-only static specimen replay. Not a direct-file or production gate.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root=resolve('.local/typography'); const fonts=resolve('public/fonts');
createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const base=pathname.startsWith('/fonts/')?fonts:pathname.startsWith('/campaign-assets/')?resolve('public'):root;
  const path=resolve(base,'.'+(pathname.startsWith('/fonts/')?pathname.slice(6):pathname));
  if(!path.startsWith(base+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(path);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.json':'application/json'}[extname(path)]??'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);}
  catch{res.writeHead(404).end();}
}).listen(3153,'127.0.0.1',()=>console.log('Specimen replay on http://127.0.0.1:3153; local files only.'));
