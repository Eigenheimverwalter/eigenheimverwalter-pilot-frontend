import fs from 'node:fs';
import path from 'node:path';

const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const directory=path.resolve(process.argv[2]||'tmp/supabase-migration');
if(!url||!key)throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen ausschließlich als Umgebungsvariablen gesetzt sein.');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
const records=JSON.parse(fs.readFileSync(path.join(directory,'legacy_portal_records.json'),'utf8'));
for(let offset=0;offset<records.length;offset+=250){
  const response=await fetch(`${url}/rest/v1/legacy_portal_records?on_conflict=collection,source_id`,{method:'POST',headers,body:JSON.stringify(records.slice(offset,offset+250))});
  if(!response.ok)throw new Error(`Datensatzimport fehlgeschlagen (${response.status}): ${await response.text()}`);
}
const documents=JSON.parse(fs.readFileSync(path.join(directory,'documents-manifest.json'),'utf8'));
for(const document of documents){
  const bytes=fs.readFileSync(document.source),objectPath=`legacy/${document.sha256}/${document.name}`;
  const response=await fetch(`${url}/storage/v1/object/${document.bucket}/${encodeURIComponent(objectPath).replaceAll('%2F','/')}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/octet-stream','x-upsert':'true'},body:bytes});
  if(!response.ok)throw new Error(`Dokumentimport ${document.name} fehlgeschlagen (${response.status}): ${await response.text()}`);
}
console.log(JSON.stringify({records:records.length,documents:documents.length,status:'imported'},null,2));
