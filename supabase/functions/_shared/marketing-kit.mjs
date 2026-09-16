export const marketingCategories = Object.freeze({flyer:'Kundenflyer',website_badge:'Webseiten-Badge',social:'Social-Media-Vorlagen',whatsapp:'WhatsApp-Vorlagen'});
export const marketingMaxBytes = 10*1024*1024;
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status})};
const partnerRoles=['partner_basic','referral_partner','crafts_partner','broker_partner'];
export function marketingAccess(profile,partner,supportView=false){
  const manage=!supportView&&['admin_light','super_admin'].includes(profile?.role)&&profile.status==='active';
  const usableProfile=profile?.status==='active'||(supportView&&profile?.status==='invited');
  const read=manage||(usableProfile&&partnerRoles.includes(profile.role)&&partner?.status==='active'&&!['paused','suspended','contract_ended','archived'].includes(partner.lifecycle));
  return{manage,read};
}
export function decodeMarketingFile(name,content){
  const filename=String(name||'').replace(/[\r\n\\/<>:"|?*\u0000-\u001f]/g,'_').trim().slice(0,180);
  if(!filename)fail('Bitte einen Dateinamen angeben.');
  if(typeof content!=='string'||content.length>Math.ceil(marketingMaxBytes/3)*4+100)fail('Die Datei darf höchstens 10 MB groß sein.',413);
  const match=content.match(/^data:(application\/pdf|image\/(?:png|jpeg|webp)|text\/plain);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)fail('Zulässig sind PDF, PNG, JPG, WEBP und TXT.');
  let binary;try{binary=atob(match[2])}catch{fail('Die Datei ist beschädigt.');}
  if(!binary.length||binary.length>marketingMaxBytes)fail('Die Datei ist leer oder größer als 10 MB.',413);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),mime=match[1];
  const formats={'application/pdf':{extension:'pdf',valid:binary.startsWith('%PDF-')&&binary.slice(-1024).includes('%%EOF')},'image/png':{extension:'png',valid:binary.startsWith('\x89PNG\r\n\x1a\n')},'image/jpeg':{extension:'jpg',valid:binary.startsWith('\xff\xd8\xff')&&binary.endsWith('\xff\xd9')},'image/webp':{extension:'webp',valid:binary.startsWith('RIFF')&&binary.slice(8,12)==='WEBP'},'text/plain':{extension:'txt',valid:true}};
  const format=formats[mime];if(!format.valid)fail('Dateiinhalt und Dokumententyp passen nicht zusammen.');
  if(mime==='text/plain'){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fail('TXT muss eine UTF-8-Textdatei sein.')}catch{fail('TXT muss eine UTF-8-Textdatei sein.');}}
  const ext=filename.split('.').at(-1).toLowerCase();if(!(mime==='image/jpeg'?['jpg','jpeg']:[format.extension]).includes(ext))fail('Bitte die passende Dateiendung verwenden.');
  return{name:filename,mime,bytes,extension:format.extension};
}
export const publicMarketingAsset=row=>({id:row.id,category:row.category,name:row.name,mimeType:row.mime_type,size:row.size_bytes,createdAt:row.created_at,publishedAt:row.published_at,status:row.status,version:row.version});

export async function marketingKitRequest({method,path,body={},profile,partner,supportView=false,store,files,now=()=>new Date().toISOString(),newId=()=>crypto.randomUUID()}){
  const access=marketingAccess(profile,partner,supportView);
  if(!access.read)fail('Keine Berechtigung für das Marketing-Kit.',403);
  if(method!=='GET'&&!access.manage)fail('Nur Admin Light und Super Admin dürfen Marketing-Inhalte verwalten.',403);
  const match=path.match(/^\/marketing-kit\/([0-9a-f-]{36})(?:\/(file))?$/i),assetId=match?.[1];
  if(path==='/marketing-kit'&&method==='GET')return{status:200,body:{canManage:access.manage,categories:marketingCategories,maxBytes:marketingMaxBytes,assets:(await store.list(access.manage)).map(publicMarketingAsset)}};
  if(path==='/marketing-kit'&&method==='POST'){
    if(!Object.hasOwn(marketingCategories,body.category))fail('Bitte eine gültige Rubrik auswählen.');
    const file=decodeMarketingFile(body.name,body.content),id=newId(),objectPath=`${id}/${id}.${file.extension}`,time=now();
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',file.bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    await files.upload(objectPath,file.bytes,file.mime);
    const row={id,category:body.category,name:file.name,mime_type:file.mime,size_bytes:file.bytes.length,object_path:objectPath,sha256,status:'draft',version:1,created_at:time,updated_at:time,created_by:profile.id,updated_by:profile.id};
    try{await store.insert(row)}catch(error){await files.remove(objectPath);throw error;}
    return{status:201,body:{asset:publicMarketingAsset(row)}};
  }
  if(!assetId)fail('Marketing-Kit-Route nicht gefunden.',404);
  const row=await store.get(assetId);if(!row||row.storage_deleted_at||(!access.manage&&row.status!=='published'))fail('Dokument nicht verfügbar.',404);
  if(method==='GET'&&match[2]==='file'){
    if(row.status==='deleted')fail('Dokument wurde entfernt.',404);
    return{status:200,body:{url:await files.signedUrl(row.object_path,60,row.name),expiresIn:60,asset:publicMarketingAsset(row)}};
  }
  if(match[2])fail('Methode nicht unterstützt.',405);
  if(method!=='PATCH'&&method!=='DELETE')fail('Methode nicht unterstützt.',405);
  if(!Number.isInteger(body.version)||body.version!==row.version)fail('Die Datei wurde zwischenzeitlich geändert. Bitte die Übersicht neu laden.',409);
  if(method==='PATCH'){
    if(row.status==='deleted')fail('Die Datei wurde bereits entfernt.',409);
    if(!['draft','published'].includes(body.status))fail('Ungültiger Freigabestatus.');
    if(body.status===row.status)return{status:200,body:{asset:publicMarketingAsset(row)}};
    const time=now(),next=await store.update(row.id,row.version,{status:body.status,published_at:body.status==='published'?time:null,updated_at:time,updated_by:profile.id,version:row.version+1});
    if(!next)fail('Gleichzeitige Änderung. Bitte neu laden.',409);
    return{status:200,body:{asset:publicMarketingAsset(next)}};
  }
  // Hide before removing bytes, so a failed Storage cleanup cannot expose it.
  const time=now(),hidden=row.status==='deleted'?row:await store.update(row.id,row.version,{status:'deleted',deleted_at:time,updated_at:time,updated_by:profile.id,version:row.version+1});
  if(!hidden)fail('Gleichzeitige Änderung. Bitte neu laden.',409);
  await files.remove(row.object_path);
  await store.update(row.id,hidden.version,{storage_deleted_at:now(),updated_at:now(),updated_by:profile.id,version:hidden.version+1});
  return{status:200,body:{deleted:true}};
}
