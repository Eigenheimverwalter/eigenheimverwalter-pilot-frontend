import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('public'),target=path.resolve(process.argv[2]||'dist'),publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY,siteBaseUrl=String(process.env.PILOT_PUBLIC_URL||'https://eigenheimverwalter-pilot.de').replace(/\/$/,'');
if(!publishableKey)throw new Error('SUPABASE_PUBLISHABLE_KEY fehlt');
fs.rmSync(target,{recursive:true,force:true});fs.cpSync(source,target,{recursive:true});
fs.writeFileSync(path.join(target,'runtime-config.js'),`window.__EHV_RUNTIME__=Object.freeze({authMode:'supabase',supabaseUrl:'https://rpniwtshbwjuesoeztyt.supabase.co',supabasePublishableKey:${JSON.stringify(publishableKey)},legacyApiBase:'',siteBaseUrl:${JSON.stringify(siteBaseUrl)}});\n`);
fs.writeFileSync(path.join(target,'.htaccess'),`Options -Indexes\nRewriteEngine On\nRewriteCond %{REQUEST_FILENAME} -f [OR]\nRewriteCond %{REQUEST_FILENAME} -d\nRewriteRule ^ - [L]\nRewriteRule ^ index.html [L]\nHeader always set X-Content-Type-Options "nosniff"\nHeader always set X-Frame-Options "DENY"\nHeader always set Referrer-Policy "no-referrer"\n`);
console.log(JSON.stringify({status:'built',target,siteBaseUrl,files:fs.readdirSync(target).length}));

