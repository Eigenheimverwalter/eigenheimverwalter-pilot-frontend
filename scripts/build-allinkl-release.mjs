import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const target=path.resolve(process.argv[2]||path.join(root,'dist-allinkl'));
const topFiles=['.htaccess','index.html','runtime-config.js','portal-api.php','app-download.html','customer-registration.html','partner-onboarding.html','referral.html'];
const excluded=new Set(['supabase-routes.mjs','api-migration-routing.mjs']);
fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(path.join(target,'assets'),{recursive:true});
for(const name of topFiles){const source=path.join(root,name);if(fs.existsSync(source))fs.copyFileSync(source,path.join(target,name));}
for(const entry of fs.readdirSync(path.join(root,'assets'),{withFileTypes:true})){
  if(!entry.isFile()||excluded.has(entry.name)||entry.name.includes('supabase'))continue;
  fs.copyFileSync(path.join(root,'assets',entry.name),path.join(target,'assets',entry.name));
}
const files=(directory=>{const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);return walk(directory)})(target);
const manifest={release:`allinkl-${new Date().toISOString().replace(/[:.]/g,'-')}`,sourceCommit:process.env.GITHUB_SHA||'working-tree',generatedAt:new Date().toISOString(),files:Object.fromEntries(files.sort().map(file=>[path.relative(target,file).replaceAll('\\','/'),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
fs.writeFileSync(path.join(target,'release-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({target,release:manifest.release,files:Object.keys(manifest.files).length},null,2));
