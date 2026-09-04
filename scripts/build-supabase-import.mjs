import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const directory=path.resolve(process.argv[2]||'tmp/supabase-migration');
const records=JSON.parse(fs.readFileSync(path.join(directory,'legacy_portal_records.json'),'utf8'));
const rows=collection=>records.filter(x=>x.collection===collection).map(x=>x.payload);
const users=rows('users');
const allowedRoles=new Set(['super_admin','admin_light','crafts_partner','broker_partner','partner_basic']);
const roleMap={referral_partner:'partner_basic'};
const identities=users.filter(x=>x.email).map(x=>({
  source_user_id:String(x.id),email:String(x.email).trim().toLowerCase(),display_name:String(x.name||''),
  role:allowedRoles.has(x.role)?x.role:roleMap[x.role]||'partner_basic',active:x.active!==false,
}));
const duplicates=identities.filter((x,i,a)=>a.findIndex(y=>y.email===x.email)!==i);
if(duplicates.length)throw new Error(`Doppelte Login-E-Mails im Quellbestand: ${[...new Set(duplicates.map(x=>x.email))].join(', ')}`);
fs.writeFileSync(path.join(directory,'identity_imports.json'),JSON.stringify(identities,null,2));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const summary={identities:identities.length,active:identities.filter(x=>x.active).length,roles:Object.fromEntries([...new Set(identities.map(x=>x.role))].map(role=>[role,identities.filter(x=>x.role===role).length])),sha256:sha(JSON.stringify(identities))};
fs.writeFileSync(path.join(directory,'identity-manifest.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
