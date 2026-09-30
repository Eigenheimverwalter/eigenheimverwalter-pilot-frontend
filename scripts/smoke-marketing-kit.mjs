// Exercise real private draft uploads only. Never publish test material to partners.
import {createHash} from 'node:crypto';
const base='https://rpniwtshbwjuesoeztyt.supabase.co',token=process.env.PILOT_SMOKE_ACCESS_TOKEN,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!token||!key)throw Error('Marketing smoke credentials missing');
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://eigenheimverwalter.github.io'},created=[];
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
async function api(path,options={}){const response=await fetch(base+'/functions/v1/portal-api'+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000)});return{status:response.status,body:await response.json()};}
const requireOk=(condition,message)=>{if(!condition)throw Error(message)};
try{
  const list=await api('/marketing-kit');requireOk(list.status===200&&list.body.canManage,'Admin Light marketing access failed');
  for(const category of ['flyer','website_badge','social','whatsapp']){
    const result=await api('/marketing-kit',{method:'POST',body:JSON.stringify({name:`CI-private-${category}.png`,category,content:png})});
    requireOk(result.status===201&&result.body.asset?.id,'Private marketing upload failed');created.push(result.body.asset);
    requireOk(result.body.asset.status==='draft'&&result.body.asset.size>0&&result.body.asset.createdAt,'Private marketing metadata failed');
    const preview=await api(`/marketing-kit/${result.body.asset.id}/file`);requireOk(preview.status===200&&preview.body.expiresIn===60,'Private preview failed');
    const bytes=await fetch(preview.body.url,{signal:AbortSignal.timeout(20000)});requireOk(bytes.status===200,'Signed marketing object failed');
    requireOk(createHash('sha256').update(Buffer.from(await bytes.arrayBuffer())).digest('hex')===createHash('sha256').update(Buffer.from(png.split(',')[1],'base64')).digest('hex'),'Uploaded marketing bytes differ');
  }
  const serviceHeaders={apikey:key,Authorization:`Bearer ${key}`};
  const partnerResponse=await fetch(base+'/rest/v1/portal_users?select=id&status=eq.active&role=in.(partner_basic,referral_partner,crafts_partner,broker_partner)',{headers:serviceHeaders});
  requireOk(partnerResponse.ok,'Partner read-only audit failed');const partners=await partnerResponse.json();
  for(const partner of partners){
    const context={'x-ehv-support-user':partner.id},visible=await api('/marketing-kit',{headers:context});
    requireOk(visible.status===200&&!visible.body.canManage&&visible.body.assets.every(a=>a.status==='published'),'Partner list filtering failed');
    requireOk(!visible.body.assets.some(a=>created.some(test=>test.id===a.id)),'Draft leaked to partner');
    requireOk((await api(`/marketing-kit/${created[0].id}/file`,{headers:context})).status===404,'Draft preview leaked to partner');
  }
  console.log(JSON.stringify({marketingKit:true,adminLight:true,draftUploadsVerified:created.length,previewBytesVerified:true,partnerRolesReadOnly:partners.length,noTestPublication:true}));
}finally{
  for(const asset of created){
    const result=await api(`/marketing-kit/${asset.id}`,{method:'DELETE',body:JSON.stringify({version:asset.version})});
    requireOk(result.status===200&&result.body.deleted,'Marketing test cleanup failed');
    requireOk((await api(`/marketing-kit/${asset.id}/file`)).status===404,'Deleted marketing object still accessible');
  }
}
console.log('Private Marketing-Testdateien entfernt; keine Partnerinhalte verändert.');
