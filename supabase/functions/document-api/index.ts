import { corsHeaders } from "../_shared/cors.ts";
import { array, authenticate, identifier, loadRuntime, replaceRuntime, scopedProperties } from "../_shared/runtime.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
const classes=new Set(["service","offer","invoice","equipment","land_register","sales_file","broker_contract","notarial_contract","other"]);
const buckets:Record<string,string>={service:"ehv-service-documents",offer:"ehv-sales-documents",invoice:"ehv-service-documents",equipment:"ehv-service-documents",land_register:"ehv-sensitive-documents",sales_file:"ehv-sales-documents",broker_contract:"ehv-sales-documents",notarial_contract:"ehv-sensitive-documents",other:"ehv-sensitive-documents"};
const extensions:Record<string,string>={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg"};
const safe=(value:unknown)=>String(value??"").replace(/[\r\n\\/<>:"|?*\u0000-\u001f]/g,"_").trim().slice(0,180);
const hex=(value:ArrayBuffer)=>[...new Uint8Array(value)].map(x=>x.toString(16).padStart(2,"0")).join("");
const decode=(content:string)=>{const match=content.match(/^data:(application\/pdf|image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Object.assign(new Error("Nur PDF, PNG und JPEG sind zulässig"),{status:422});const binary=atob(match[2]);if(!binary.length||binary.length>10*1024*1024)throw Object.assign(new Error("Datei ist leer oder größer als 10 MB"),{status:413});const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return{mime:match[1],bytes};};
const legacyTarget=(route:string,state:Record<string,unknown>)=>{
  const patterns=[
    [/^\/api\/cases\/([^/]+)\/documents$/,"serviceCases","service"],
    [/^\/api\/broker\/sales-files\/([^/]+)\/documents$/,"salesFiles","sales_file"],
    [/^\/api\/equipment\/([^/]+)\/offers$/,"equipmentRecords","offer"],
    [/^\/api\/production\/properties\/([^/]+)\/land-register$/,"properties","land_register"],
  ] as const;
  for(const [pattern,key,documentClass] of patterns){const id=route.match(pattern)?.[1];if(id){const entity=array(state[key]).find(x=>String(x.id)===id);return entity?{entity,key,id,documentClass}:null;}}
  return null;
};

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  let auth;try{auth=await authenticate(req.headers.get("Authorization"));}catch(error){return json({error:error instanceof Error?error.message:"Nicht angemeldet"},Number((error as {status?:number}).status||401));}
  const {user,profile,sourceUserId,service}=auth,url=new URL(req.url),documentId=url.searchParams.get("id");
  try{
    const snapshot=await loadRuntime(service),allowed=new Set(scopedProperties(snapshot.state,profile,sourceUserId).map(x=>String(x.id)));
    if(req.method==="POST"){
      const body=await req.json(),target=legacyTarget(String(body.legacyRoute||""),snapshot.state),propertyId=String(body.propertyId||target?.entity.propertyId||target?.entity.id||""),documentClass=String(body.documentClass||target?.documentClass||"other"),name=safe(body.name),file=decode(String(body.content||""));
      if(!allowed.has(propertyId))return json({error:"Kein Zugriff auf dieses Objekt"},403);if(!classes.has(documentClass)||!name)return json({error:"Dokumentklasse und Dateiname sind erforderlich"},422);
      const sha256=hex(await crypto.subtle.digest("SHA-256",file.bytes)),bucket=buckets[documentClass],objectPath=`${propertyId}/${crypto.randomUUID()}.${extensions[file.mime]}`;
      const {error:uploadError}=await service.storage.from(bucket).upload(objectPath,file.bytes,{contentType:file.mime,upsert:false});if(uploadError)throw new Error("Datei konnte nicht gespeichert werden");
      const {data:property}=await service.from("properties").select("id").eq("source_id",propertyId).maybeSingle();
      const record={property_id:property?.id||null,source_property_id:propertyId,source_entity_type:safe(body.entityType)||null,source_entity_id:safe(body.entityId)||null,document_class:documentClass,bucket_id:bucket,object_path:objectPath,original_name:name,mime_type:file.mime,size_bytes:file.bytes.length,sha256,uploaded_by:user.id};
      const {data,error}=await service.from("documents").insert(record).select("id,original_name,mime_type,size_bytes,sha256,created_at,document_class,source_property_id").single();
      if(error){await service.storage.from(bucket).remove([objectPath]);throw new Error("Dokumentmetadaten konnten nicht gespeichert werden");}
      if(target){
        const reference={id:data.id,name,mime:file.mime,size:file.bytes.length,sha256,kind:safe(body.kind)||documentClass,createdAt:data.created_at};
        if(target.key==="serviceCases"){const documents=Array.isArray(target.entity.documents)?target.entity.documents:[];documents.push(reference);target.entity.documents=documents;}
        if(target.key==="salesFiles"){const rows=array(snapshot.state.brokerSalesDocuments);rows.push({...reference,id:data.id,salesFileId:target.id,propertyId});snapshot.state.brokerSalesDocuments=rows;}
        if(target.key==="equipmentRecords"){const rows=array(snapshot.state.partnerOffers);rows.push({id:identifier("offer"),documentId:data.id,equipmentId:target.id,propertyId,partnerId:null,status:"uploaded",uploadedAt:data.created_at});snapshot.state.partnerOffers=rows;}
        await replaceRuntime(service,snapshot,user.id,"document.linked",target.key,target.id,{documentId:data.id,propertyId,documentClass});
      }
      await service.from("audit_events").insert({actor_user_id:user.id,action:"document.uploaded",entity_type:"document",entity_id:data.id,metadata:{propertyId,documentClass,sha256,size:file.bytes.length}});return json({document:data},201);
    }
    if(!documentId)return json({error:"Dokument-ID fehlt"},422);
    const {data:document,error}=await service.from("documents").select("*").eq("id",documentId).is("deleted_at",null).single();if(error||!document)return json({error:"Dokument nicht gefunden"},404);
    if(!document.source_property_id||!allowed.has(String(document.source_property_id)))return json({error:"Dokument nicht freigegeben"},403);
    if(req.method==="GET"){
      const {data:signed,error:signedError}=await service.storage.from(document.bucket_id).createSignedUrl(document.object_path,60);if(signedError)throw new Error("Dokument konnte nicht bereitgestellt werden");
      await service.from("audit_events").insert({actor_user_id:user.id,action:"document.viewed",entity_type:"document",entity_id:document.id,metadata:{propertyId:document.source_property_id}});return json({url:signed.signedUrl,expiresIn:60,document:{id:document.id,name:document.original_name,mimeType:document.mime_type,sha256:document.sha256}});
    }
    if(req.method==="DELETE"){
      const owner=document.uploaded_by===user.id,admin=["super_admin","admin_light"].includes(profile.role);if(!owner&&!admin)return json({error:"Keine Löschberechtigung"},403);
      await service.from("documents").update({deleted_at:new Date().toISOString()}).eq("id",document.id);await service.from("audit_events").insert({actor_user_id:user.id,action:"document.deleted",entity_type:"document",entity_id:document.id,metadata:{propertyId:document.source_property_id}});return new Response(null,{status:204,headers:corsHeaders});
    }
    return json({error:"Methode nicht unterstützt"},405);
  }catch(error){return json({error:error instanceof Error?error.message:"Dokumentenverarbeitung fehlgeschlagen"},Number((error as {status?:number}).status||500));}
});
