import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('public'),target=path.resolve(process.argv[2]||'dist'),publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY,siteBaseUrl=String(process.env.PILOT_PUBLIC_URL||'https://eigenheimverwalter-pilot.de').replace(/\/$/,''),basePath=String(process.env.PILOT_BASE_PATH||'').replace(/^\/*|\/*$/g,'');
if(!publishableKey)throw new Error('SUPABASE_PUBLISHABLE_KEY fehlt');
fs.rmSync(target,{recursive:true,force:true});fs.cpSync(source,target,{recursive:true});
const prefix=basePath?`/${basePath}`:'';
for(const name of ['index.html','customer-registration.html','referral.html']){const file=path.join(target,name),html=fs.readFileSync(file,'utf8').replace('<head>',`<head><base href="${prefix}/">`).replaceAll('="/assets/','="'+prefix+'/assets/');fs.writeFileSync(file,html);}
const partnerFlow=path.join(target,'assets/partner-basic.js');fs.writeFileSync(partnerFlow,fs.readFileSync(partnerFlow,'utf8').replaceAll("location.pathname.split('/').filter(Boolean)","location.pathname.split('/').filter(Boolean).slice(-2)"));
fs.writeFileSync(path.join(target,'runtime-config.js'),`window.__EHV_RUNTIME__=Object.freeze({authMode:'supabase',supabaseUrl:'https://rpniwtshbwjuesoeztyt.supabase.co',supabasePublishableKey:${JSON.stringify(publishableKey)},legacyApiBase:'',siteBaseUrl:${JSON.stringify(siteBaseUrl)},basePath:${JSON.stringify(prefix)}});\n`);
const router=`<!doctype html><meta charset="utf-8"><script>const b=${JSON.stringify(prefix||'')},p=location.pathname.slice(b.length),f=p.startsWith('/registrierung/')?'customer-registration.html':p.startsWith('/ref/')?'referral.html':'index.html';fetch(b+'/'+f).then(r=>r.text()).then(h=>{document.open();document.write(h);document.close()})<\/script>`;
fs.writeFileSync(path.join(target,'404.html'),router);
fs.writeFileSync(path.join(target,'.htaccess'),`Options -Indexes\nRewriteEngine On\nRewriteCond %{REQUEST_FILENAME} -f [OR]\nRewriteCond %{REQUEST_FILENAME} -d\nRewriteRule ^ - [L]\nRewriteRule ^ index.html [L]\nHeader always set X-Content-Type-Options "nosniff"\nHeader always set X-Frame-Options "DENY"\nHeader always set Referrer-Policy "no-referrer"\n`);
console.log(JSON.stringify({status:'built',target,siteBaseUrl,files:fs.readdirSync(target).length}));
