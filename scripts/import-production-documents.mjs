import crypto from 'node:crypto';
import fs from 'node:fs';

const source=JSON.parse(fs.readFileSync(process.argv[2]||'tmp/source/production-mirror.json','utf8'));
const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const exportBase=String(process.env.PILOT_MIGRATION_EXPORT_BASE||'').replace(/\/$/,'');
const exportToken=process.env.PILOT_MIGRATION_EXPORT_TOKEN;
if(!supabaseUrl||!serviceKey||!exportBase||!exportToken)throw new Error('Supabase- und Export-Zugangsdaten fehlen');
const files=source?.tables?.property_files;
if(source?.meta?.classification!=='CONFIDENTIAL_CUSTOMER_DATA'||!Array.isArray(files))throw new Error('Ungültiger Produktivdaten-Mirror');
const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
const result={available:0,missing:0,unsupported:0,failed:0,documents:[]};
const extension=mime=>({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[mime]);
const upload=async record=>{
  if(!record.file){result.missing++;return;}
  const response=await fetch(`${exportBase}/api/migration/production-files/${encodeURIComponent(record.id)}`,{headers:{Authorization:`Bearer ${exportToken}`}});
  if(response.status===404){result.missing++;return;}
  if(response.status===415){result.unsupported++;return;}
  if(!response.ok){result.failed++;return;}
  const mime=String(response.headers.get('content-type')||'').split(';')[0],ext=extension(mime),bytes=new Uint8Array(await response.arrayBuffer());
  if(!ext||!bytes.length||bytes.length>50*1024*1024){result.failed++;return;}
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),bucket='ehv-sensitive-documents',objectPath=`production/${record.property_id}/${record.id}-${sha256}.${ext}`;
  const storageResponse=await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':mime,'x-upsert':'true'},body:bytes});
  if(!storageResponse.ok){result.failed++;return;}
  const metadata={property_id:null,source_property_id:String(record.property_id),source_entity_type:'production_property_file',source_entity_id:String(record.id),document_class:'other',bucket_id:bucket,object_path:objectPath,original_name:String(record.file).slice(0,180),mime_type:mime,size_bytes:bytes.length,sha256,uploaded_by:null,created_at:record.created_at||new Date().toISOString(),deleted_at:null};
  const metadataResponse=await fetch(`${supabaseUrl}/rest/v1/documents?on_conflict=source_entity_type,source_entity_id`,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(metadata)});
  if(!metadataResponse.ok){result.failed++;return;}
  const [document]=await metadataResponse.json();result.available++;result.documents.push({sourceId:String(record.id),documentId:document.id,bucket,objectPath});
};
for(let offset=0;offset<files.length;offset+=8)await Promise.all(files.slice(offset,offset+8).map(upload));
if(result.failed)throw new Error(`${result.failed} vorhandene Dokumente konnten nicht sicher importiert werden`);
const stateResponse=await fetch(`${supabaseUrl}/rest/v1/portal_runtime_state?id=eq.primary&select=payload,revision`,{headers});
if(!stateResponse.ok)throw new Error('Laufzeitstand konnte nach Dokumentimport nicht geladen werden');
const [current]=await stateResponse.json(),bySource=new Map(result.documents.map(item=>[item.sourceId,item]));
const mirror=current?.payload?.productionMirror,nextFiles=mirror?.tables?.property_files?.map(item=>{const imported=bySource.get(String(item.id));return imported?{...item,fileAvailable:true,supabaseDocumentId:imported.documentId,storageBucket:imported.bucket,storageObjectPath:imported.objectPath}:{...item,fileAvailable:false};});
if(!nextFiles)throw new Error('Produktivspiegel fehlt im aktuellen Laufzeitstand');
const next={...current.payload,productionMirror:{...mirror,tables:{...mirror.tables,property_files:nextFiles}}};
const replace=await fetch(`${supabaseUrl}/rest/v1/rpc/replace_portal_runtime_state`,{method:'POST',headers,body:JSON.stringify({expected_revision:current.revision,next_payload:next,audit_actor:null,audit_action:'migration.production_documents.merged',audit_entity_type:'production_documents',audit_entity_id:'source',audit_metadata:{available:result.available,missing:result.missing,unsupported:result.unsupported,total:files.length}})});
if(!replace.ok)throw new Error(`Dokumentstatus konnte nicht atomar gespeichert werden (${replace.status})`);
console.log(JSON.stringify({status:'validated',total:files.length,available:result.available,missing:result.missing,unsupported:result.unsupported,failed:result.failed},null,2));
