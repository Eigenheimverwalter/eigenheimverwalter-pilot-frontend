import fs from 'node:fs';
import path from 'node:path';

const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const directory=path.resolve(process.argv[2]||'tmp/supabase-migration');
if(!url||!key)throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen ausschließlich als Umgebungsvariablen gesetzt sein.');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
const records=JSON.parse(fs.readFileSync(path.join(directory,'legacy_portal_records.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'migration-manifest.json'),'utf8'));
const identities=JSON.parse(fs.readFileSync(path.join(directory,'identity_imports.json'),'utf8'));
const runResponse=await fetch(`${url}/rest/v1/migration_runs`,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({source_name:manifest.source,source_manifest_sha256:manifest.records_sha256,status:'running',expected_records:manifest.record_count,expected_documents:manifest.document_count,details:{collections:manifest.collections}})});
if(!runResponse.ok)throw new Error(`Migrationslauf konnte nicht registriert werden (${runResponse.status}): ${await runResponse.text()}`);
const [run]=await runResponse.json();
for(let offset=0;offset<records.length;offset+=250){
  const response=await fetch(`${url}/rest/v1/legacy_portal_records?on_conflict=collection,source_id`,{method:'POST',headers,body:JSON.stringify(records.slice(offset,offset+250))});
  if(!response.ok)throw new Error(`Datensatzimport fehlgeschlagen (${response.status}): ${await response.text()}`);
}
for(let offset=0;offset<identities.length;offset+=250){
  const response=await fetch(`${url}/rest/v1/identity_imports?on_conflict=source_user_id`,{method:'POST',headers,body:JSON.stringify(identities.slice(offset,offset+250))});
  if(!response.ok)throw new Error(`Identitätsimport fehlgeschlagen (${response.status}): ${await response.text()}`);
}
const documents=JSON.parse(fs.readFileSync(path.join(directory,'documents-manifest.json'),'utf8'));
for(const document of documents){
  const bytes=fs.readFileSync(document.source),objectPath=`legacy/${document.sha256}/${document.name}`;
  const response=await fetch(`${url}/storage/v1/object/${document.bucket}/${encodeURIComponent(objectPath).replaceAll('%2F','/')}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/octet-stream','x-upsert':'true'},body:bytes});
  if(!response.ok)throw new Error(`Dokumentimport ${document.name} fehlgeschlagen (${response.status}): ${await response.text()}`);
}
const finalResponse=await fetch(`${url}/rest/v1/migration_runs?id=eq.${run.id}`,{method:'PATCH',headers,body:JSON.stringify({status:'validated',imported_records:records.length,imported_documents:documents.length,completed_at:new Date().toISOString(),details:{collections:manifest.collections,records_sha256:manifest.records_sha256,documents_manifest_sha256:manifest.documents_manifest_sha256}})});
if(!finalResponse.ok)throw new Error(`Migrationslauf konnte nicht abgeschlossen werden: ${await finalResponse.text()}`);
console.log(JSON.stringify({run_id:run.id,records:records.length,identities:identities.length,documents:documents.length,status:'validated'},null,2));
