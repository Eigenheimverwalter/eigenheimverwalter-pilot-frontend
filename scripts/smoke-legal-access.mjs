// Read-only production audit. No contracts uploaded/published, no acceptance
// created, no roles modified, no email and no payment request.
const base='https://rpniwtshbwjuesoeztyt.supabase.co',token=process.env.PILOT_SMOKE_ACCESS_TOKEN,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!token||!key)throw Error('Legal access audit credentials missing');
const headers={Authorization:`Bearer ${token}`,Origin:'https://eigenheimverwalter.github.io'},admin={Authorization:`Bearer ${key}`,apikey:key};
const must=(condition,message)=>{if(!condition)throw Error(message)};
const profileResponse=await fetch(base+'/functions/v1/portal-api/me',{headers});must(profileResponse.ok,'Legal audit identity missing');const {user}=await profileResponse.json();
const stateResponse=await fetch(base+'/rest/v1/portal_runtime_state?select=payload&id=eq.primary',{headers:admin});must(stateResponse.ok,'Legal role configuration unavailable');const records=await stateResponse.json();
const roleProfiles=records[0]?.payload?.roleProfiles||[],rights=roleProfiles.find(p=>p.role===user.role)?.permissions||[];
const canRead=user.role==='super_admin'||user.role==='admin_light'&&(rights.includes('*')||rights.includes('legal_documents.read'));
const list=await fetch(base+'/functions/v1/portal-api/legal-documents',{headers});must(list.status===(canRead?200:403),'Legal read permissions disagree with existing role profile');
const legalPath='/functions/v1/portal-api/partner-onboarding/00000000-0000-4000-8000-000000000000/legal';
const staffLegal=await fetch(base+legalPath,{headers});must(staffLegal.status===403,'Staff must not provide partner legal acceptance');
const anonymousLegal=await fetch(base+legalPath);must(anonymousLegal.status===401,'Anonymous onboarding legal access must be denied');
const rpc=await fetch(base+'/rest/v1/rpc/partner_legal_step',{method:'POST',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({p_action:'READ',p_onboarding:'00000000-0000-4000-8000-000000000000',p_actor:user.id})});
must(!rpc.ok&&(await rpc.json()).message==='ONBOARDING_NOT_FOUND','Legal acceptance RPC not available or unsafe');
for(const table of ['legal_documents','legal_acceptances','partner_onboardings']){
  const response=await fetch(base+'/rest/v1/'+table+'?select=id&limit=1',{headers:admin});must(response.ok,'Legal migration table not available: '+table);
}
const storage=await fetch(base+'/storage/v1/bucket/ehv-legal-documents',{headers:admin});must(storage.ok,'Legal private bucket missing');must((await storage.json()).public===false,'Legal bucket must remain private');
const partnersResponse=await fetch(base+'/rest/v1/portal_users?select=id&status=eq.active&role=in.(partner_basic,referral_partner,crafts_partner,broker_partner)',{headers:admin});must(partnersResponse.ok,'Legal partner ACL audit unavailable');const partners=await partnersResponse.json();
for(const partner of partners){const r=await fetch(base+'/functions/v1/portal-api/legal-documents',{headers:{...headers,'x-ehv-support-user':partner.id}});must(r.status===403,'Partner support view reached legal administration');}
console.log(JSON.stringify({legalAccess:true,readOnly:true,roleProfileEnforced:true,privateBucket:true,schemaAvailable:true,partnerViewsDenied:partners.length,acceptanceRpcAvailable:true,staffAcceptanceDenied:true,anonymousAcceptanceDenied:true,noContractPublication:true,noPayment:true}));
