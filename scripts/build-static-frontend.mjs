import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('public'),target=path.resolve(process.argv[2]||'dist'),publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY,siteBaseUrl=String(process.env.PILOT_PUBLIC_URL||'https://eigenheimverwalter-pilot.de').replace(/\/$/,''),basePath=String(process.env.PILOT_BASE_PATH||'').replace(/^\/*|\/*$/g,'');
if(!publishableKey)throw new Error('SUPABASE_PUBLISHABLE_KEY fehlt');
fs.rmSync(target,{recursive:true,force:true});fs.cpSync(source,target,{recursive:true});
const prefix=basePath?`/${basePath}`:'';
for(const name of ['index.html','customer-registration.html','referral.html','app-download.html','partner-onboarding.html']){const file=path.join(target,name),html=fs.readFileSync(file,'utf8').replace(/<base href="[^"]*">/g,'').replace('<head>',`<head><base href="${prefix}/">`).replaceAll('="/assets/','="'+prefix+'/assets/');fs.writeFileSync(file,html);}
const passwordResetDirectory=path.join(target,'passwort-zuruecksetzen');
fs.mkdirSync(passwordResetDirectory,{recursive:true});
fs.copyFileSync(path.join(target,'index.html'),path.join(passwordResetDirectory,'index.html'));
// The public self-service start is a real Pages directory, not a 404 fallback.
const onboardingDirectory=path.join(target,'partner-onboarding');
fs.mkdirSync(onboardingDirectory,{recursive:true});
fs.copyFileSync(path.join(target,'partner-onboarding.html'),path.join(onboardingDirectory,'index.html'));
const partnerFlow=path.join(target,'assets/partner-basic.js');fs.writeFileSync(partnerFlow,fs.readFileSync(partnerFlow,'utf8').replaceAll("location.pathname.split('/').filter(Boolean)","location.pathname.split('/').filter(Boolean).slice(-2)"));
fs.writeFileSync(path.join(target,'runtime-config.js'),`window.__EHV_RUNTIME__=Object.freeze({authMode:'supabase',supabaseUrl:'https://rpniwtshbwjuesoeztyt.supabase.co',supabasePublishableKey:${JSON.stringify(publishableKey)},legacyApiBase:'',siteBaseUrl:${JSON.stringify(siteBaseUrl)},basePath:${JSON.stringify(prefix)}});\n`);
const router=`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><script>const b=${JSON.stringify(prefix||'')},p=location.pathname.slice(b.length),f=p.startsWith('/partner-onboarding/')?'partner-onboarding.html':p.startsWith('/registrierung/')?'customer-registration.html':p.startsWith('/ref/')?'referral.html':'index.html';fetch(b+'/'+f).then(r=>r.text()).then(h=>{document.open();document.write(h);document.close()})<\/script>`;
fs.writeFileSync(path.join(target,'404.html'),router);
fs.writeFileSync(path.join(target,'.htaccess'),`Options -Indexes\nRewriteEngine On\nRewriteCond %{REQUEST_FILENAME} -f [OR]\nRewriteCond %{REQUEST_FILENAME} -d\nRewriteRule ^ - [L]\nRewriteRule ^partner-onboarding/ partner-onboarding.html [L]\nRewriteRule ^ index.html [L]\nHeader always set X-Content-Type-Options "nosniff"\nHeader always set X-Frame-Options "DENY"\nHeader always set Referrer-Policy "no-referrer"\n`);
console.log(JSON.stringify({status:'built',target,siteBaseUrl,files:fs.readdirSync(target).length}));
