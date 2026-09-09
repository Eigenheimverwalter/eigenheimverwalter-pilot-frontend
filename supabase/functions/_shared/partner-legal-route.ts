import {assertPartnerLegalIdentity,partnerLegalErrors,partnerLegalRequest} from './partner-legal.mjs';
export async function partnerLegalRoute(req:Request,path:string,service:any,profile:any,user:any){
  const supportView=Boolean(req.headers.get('x-ehv-support-user'));
  assertPartnerLegalIdentity(profile,user,supportView);
  let body:any={};
  if(req.method==='POST'){
    // A small, streaming cap; no file bytes belong in this endpoint.
    const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>8192){await reader.cancel();throw Object.assign(new Error('Zu viele Bestätigungsdaten.'),{status:413});}chunks.push(value);}}
      finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(new Error('Ungültige Bestätigungsdaten.'),{status:400});}
  }
  const store={step:async(input:any)=>{
    const {data,error}=await service.rpc('partner_legal_step',{p_action:input.action,p_onboarding:input.onboardingId,p_actor:input.actor,
      p_documents:input.documents,p_document:input.documentId,p_ip:input.ip,p_user_agent:input.userAgent});
    if(error){const code=Object.keys(partnerLegalErrors).find(k=>String(error.message).includes(k));
      const [message,status]=code?partnerLegalErrors[code]:['Die Zustimmung konnte nicht bestätigt werden. Bitte den Status neu laden, bevor Sie erneut bestätigen.',503];
      throw Object.assign(new Error(message),{status,code});}
    return data;
  }};
  const files={signedUrl:async(path:string,seconds:number)=>{
    const {data,error}=await service.storage.from('ehv-legal-documents').createSignedUrl(path,seconds);
    if(error||!data?.signedUrl)throw Object.assign(new Error('Das Dokument konnte nicht geöffnet werden. Bitte erneut versuchen.'),{status:503});
    return data.signedUrl;
  }};
  return partnerLegalRequest({method:req.method,path,body,profile,user,supportView,store,files,userAgent:req.headers.get('user-agent')||''});
}
