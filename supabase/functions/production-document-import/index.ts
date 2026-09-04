import { array, loadRuntime, serviceClient } from "../_shared/runtime.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const safe=(value:unknown)=>String(value??"").replace(/[\r\n\\/<>:"|?*\u0000-\u001f]/g,"_").trim().slice(0,180);
const hex=(value:ArrayBuffer)=>[...new Uint8Array(value)].map(x=>x.toString(16).padStart(2,"0")).join("");
const authorize=async(req:Request)=>{const token=String(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return null;const headers={Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};const userResponse=await fetch("https://api.github.com/user",{headers});if(!userResponse.ok)return null;const user=await userResponse.json();const permissionResponse=await fetch(`https://api.github.com/repos/Eigenheimverwalter/eigenheimverwalter-pilot-admin/collaborators/${encodeURIComponent(user.login)}/permission`,{headers});if(!permissionResponse.ok)return null;const permission=await permissionResponse.json();return ["admin","maintain","write"].includes(permission.permission)?user:null;};

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Methode nicht unterstützt"},405);
  const githubUser=await authorize(req);if(!githubUser)return json({error:"GitHub-Repository-Berechtigung erforderlich"},403);
  const body=await req.json().catch(()=>null);if(!body)return json({error:"Ungültige Nutzdaten"},422);
  const service=serviceClient(),snapshot=await loadRuntime(service),mirror=snapshot.state.productionMirror as Record<string,unknown>|undefined,tables=mirror?.tables as Record<string,unknown>|undefined,files=array(tables?.property_files);
  if(body.action==="finalize"){
    const {data:documents,error}=await service.from("documents").select("id,source_entity_id,bucket_id,object_path").eq("source_entity_type","production_property_file").is("deleted_at",null);if(error)return json({error:"Dokumentstatus konnte nicht geladen werden"},503);
    const bySource=new Map((documents||[]).map(item=>[String(item.source_entity_id),item]));tables!.property_files=files.map(item=>{const document=bySource.get(String(item.id));return document?{...item,fileAvailable:true,supabaseDocumentId:document.id,storageBucket:document.bucket_id,storageObjectPath:document.object_path}:{...item,fileAvailable:false};});
    const {error:replaceError}=await service.rpc("replace_portal_runtime_state",{expected_revision:snapshot.revision,next_payload:snapshot.state,audit_actor:null,audit_action:"migration.local_production_documents.finalized",audit_entity_type:"production_documents",audit_entity_id:"local_archive",audit_metadata:{available:bySource.size,githubActor:githubUser.login}});if(replaceError)return json({error:"Laufzeitstatus wurde parallel geändert"},409);return json({status:"validated",available:bySource.size,total:files.length});
  }
  const sourceId=String(body.sourceId||""),propertyId=String(body.propertyId||""),record=files.find(item=>String(item.id)===sourceId&&String(item.property_id)===propertyId);if(!record||safe(record.file)!==safe(body.name))return json({error:"Datei ist im vertraulichen Manifest nicht eindeutig belegt"},422);
  const mime=String(body.mime||""),extensions:Record<string,string>={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg"},extension=extensions[mime],binary=atob(String(body.contentBase64||""));if(!extension||!binary.length||binary.length>50*1024*1024)return json({error:"Dateityp oder Größe unzulässig"},422);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const sha256=hex(await crypto.subtle.digest("SHA-256",bytes)),bucket="ehv-sensitive-documents",objectPath=`production/${propertyId}/${sourceId}-${sha256}.${extension}`;
  const {error:uploadError}=await service.storage.from(bucket).upload(objectPath,bytes,{contentType:mime,upsert:true});if(uploadError)return json({error:"Speicherimport fehlgeschlagen"},503);
  const metadata={property_id:null,source_property_id:propertyId,source_entity_type:"production_property_file",source_entity_id:sourceId,document_class:"other",bucket_id:bucket,object_path:objectPath,original_name:safe(body.name),mime_type:mime,size_bytes:bytes.length,sha256,uploaded_by:null,created_at:record.created_at||new Date().toISOString(),deleted_at:null};
  const {data,error}=await service.from("documents").upsert(metadata,{onConflict:"source_entity_type,source_entity_id"}).select("id").single();if(error)return json({error:"Dokumentmetadaten konnten nicht gespeichert werden"},503);return json({status:"imported",sourceId,documentId:data.id,sha256,size:bytes.length});
});

