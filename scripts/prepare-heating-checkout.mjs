import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
const base='https://rpniwtshbwjuesoeztyt.supabase.co',email=process.env.TEST_PARTNER_EMAIL||'basic.heizung@ehv.test',key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const broker=email==='makler_basic@ehv.test';
if(!['basic.heizung@ehv.test','makler_basic@ehv.test'].includes(email))throw Error('Unsupported sandbox account');
if(!key)throw Error('Service configuration missing');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'};
async function call(path,method='GET',body,extra={}){const r=await fetch(base+path,{method,headers:{...headers,...extra},...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Sandbox preparation failed: '+r.status+' '+path.split('?')[0]);return r.status===204?null:r.json();}
const [runtime]=await call('/rest/v1/portal_runtime_state?id=eq.primary&select=payload');
const partners=(runtime.payload.partners||[]).filter(p=>p.email?.toLowerCase()===email);
if(partners.length!==1||partners[0].primaryTradeId!==(broker?'BROKER':'EQUIP_HEIZUNG')||partners[0].plan!=='basic'||partners[0].referralOnly)throw Error('Unexpected test partner configuration');
const partner=partners[0];
const [identity]=await call('/rest/v1/identity_imports?source_user_id=eq.'+encodeURIComponent(partner.userId)+'&select=auth_user_id,email');
if(!identity?.auth_user_id||identity.email?.toLowerCase()!==email)throw Error('Test identity mismatch');
const [adminIdentity]=await call('/rest/v1/identity_imports?email=eq.info%40eigenheimverwalter.de&select=auth_user_id');
if(!adminIdentity?.auth_user_id)throw Error('Admin approval identity unavailable');
const [admin]=await call('/rest/v1/portal_users?id=eq.'+adminIdentity.auth_user_id+'&role=eq.super_admin&status=eq.active&select=id');
if(!admin)throw Error('Admin approval role unavailable');
let [flow]=await call('/rest/v1/partner_onboardings?auth_user_id=eq.'+identity.auth_user_id+'&status=not.in.(ACTIVE,CANCELLED,EXPIRED)&select=*');
if(!flow){
  const prefilled_data={company:partner.company||'TEST Heizungsbetrieb',contact_name:partner.contactName||'TEST Ansprechpartner',email,
    phone:partner.phone||'000000000',address:partner.address||'Fiktive Testadresse 1',postal_code:partner.postalCode||'22043',city:partner.city||'Hamburg'};
  const result=await call('/rest/v1/rpc/create_partner_onboarding','POST',{p_actor:identity.auth_user_id,p_token_hash:createHash('sha256').update(randomBytes(32)).digest('hex'),p_input:{source:'SELF_SERVICE_PREMIUM',requested_plan:'PREMIUM',partner_type:broker?'BROKER_PARTNER':'EQUIPMENT_PARTNER',equipment_type:broker?null:'EQUIP_HEIZUNG',existing_partner_id:partner.id,prefilled_data,request_key:broker?'a17d6301-29be-4a3b-9747-68ebbb389bc2':'a17d6301-29be-4a3b-9747-68ebbb389bc1'}});
  flow=result.flow;
}
if(!flow.sandbox_only||flow.prefilled_data.email!==email||flow.existing_partner_id!==partner.id)throw Error('No scoped sandbox onboarding');
for(const [type,file,title,acceptance] of [
  ['TERMS','terms-test.pdf','TEST Kooperationsbedingungen','Ich stimme ausschließlich den Bedingungen dieses technischen Sandbox-Tests zu. Es entsteht kein produktiver Vertrag.'],
  ['PRIVACY','privacy-test.pdf','TEST Datenschutzhinweise','Ich habe die Hinweise zu diesem technischen Sandbox-Test zur Kenntnis genommen.']]){
  let [doc]=await call(`/rest/v1/legal_documents?sandbox_onboarding_id=eq.${flow.id}&document_type=eq.${type}&status=not.eq.ARCHIVED&select=*&order=version.desc&limit=1`);
  if(!doc){
    const bytes=readFileSync(new URL('../test/fixtures/partner-premium/'+(broker?'broker-':'')+file,import.meta.url));
    const id=crypto.randomUUID(),path=`sandbox/${flow.id}/${id}/${file}`;
    await call('/storage/v1/object/ehv-legal-documents/'+path,'POST',bytes,{'Content-Type':'application/pdf'});
    const [last]=await call(`/rest/v1/legal_documents?document_type=eq.${type}&select=version&order=version.desc&limit=1`);
    [doc]=await call('/rest/v1/legal_documents','POST',{id,document_type:type,title,file_name:file,storage_path:path,mime_type:'application/pdf',file_size:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),version:(last?.version||0)+1,acceptance_text:acceptance,sandbox_onboarding_id:flow.id,uploaded_by:admin.id});
  }
  if(doc.status==='DRAFT')doc=await call('/rest/v1/rpc/change_legal_document','POST',{p_action:'APPROVE',p_id:doc.id,p_actor:admin.id,p_revision:doc.revision,p_data:{}});
  if(doc.status==='APPROVED')doc=await call('/rest/v1/rpc/change_legal_document','POST',{p_action:'ACTIVATE',p_id:doc.id,p_actor:admin.id,p_revision:doc.revision,p_data:{effective_from:new Date().toISOString()}});
  if(doc.status!=='ACTIVE')throw Error('Test document not active');
}
console.log(JSON.stringify({sandboxReady:true,scope:broker?'broker-test-only':'heating-test-only',testDocuments:2,acceptancesCreated:0,productionAccountsChanged:0,onboardingId:flow.id}));
