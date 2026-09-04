import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('public'),target=path.resolve('supabase/functions/portal-web/index.ts');
const files=[];const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=='runtime-config.js')files.push(full);}};walk(root);
const mime=name=>name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')||name.endsWith('.mjs')?'text/javascript; charset=utf-8':'application/octet-stream';
const entries=files.map(file=>{const key='/'+path.relative(root,file).replaceAll('\\','/'),raw=fs.readFileSync(file),content=file.endsWith('.html')?Buffer.from(raw.toString('utf8').replaceAll('="/assets/','="./assets/')):raw;return `${JSON.stringify(key)}:{mime:${JSON.stringify(mime(file))},base64:${JSON.stringify(content.toString('base64'))}}`;});
const source=`const files:Record<string,{mime:string;base64:string}>={${entries.join(',')}};
const decode=(value:string)=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
const security={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://esm.sh; connect-src 'self' https://rpniwtshbwjuesoeztyt.supabase.co; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
Deno.serve(req=>{const url=new URL(req.url),marker='/portal-web',relative=url.pathname.slice(url.pathname.indexOf(marker)+marker.length)||'/';if(relative==='/'&&!url.pathname.endsWith('/'))return Response.redirect(url.origin+'/functions/v1/portal-web/',308);if(relative==='/runtime-config.js')return new Response(\`window.__EHV_RUNTIME__=Object.freeze({authMode:'supabase',supabaseUrl:'\${Deno.env.get("SUPABASE_URL")}',supabasePublishableKey:'\${Deno.env.get("SUPABASE_ANON_KEY")}',legacyApiBase:'',siteBaseUrl:'\${url.origin}/functions/v1/portal-web'});\`,{headers:{...security,"Content-Type":"text/javascript; charset=utf-8"}});let key=relative;if(relative.startsWith('/ref/'))key='/referral.html';else if(relative.startsWith('/registrierung/'))key='/customer-registration.html';else if(!files[key])key='/index.html';const file=files[key];return new Response(decode(file.base64),{headers:{...security,"Content-Type":file.mime,"Cache-Control":key.startsWith('/assets/')?'public, max-age=300':'no-store'}});});
`;
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
console.log(JSON.stringify({files:files.length,bytes:Buffer.byteLength(source),target}));

