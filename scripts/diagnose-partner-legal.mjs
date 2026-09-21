import {requiredLegalState} from '../supabase/functions/_shared/partner-onboarding.mjs';

const base=process.env.SUPABASE_URL||'https://rpniwtshbwjuesoeztyt.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const email=String(process.env.PARTNER_EMAIL||'').trim().toLowerCase();
if(!key||!email)throw Error('SUPABASE_SERVICE_ROLE_KEY und PARTNER_EMAIL sind erforderlich.');
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function get(path){const response=await fetch(`${base}/rest/v1/${path}`,{headers}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||`HTTP ${response.status}`);return data}

const flows=await get(`partner_onboardings?select=id,auth_user_id,status,requested_plan,partner_type,sandbox_only,prefilled_data,required_document_types,created_at&prefilled_data-%3E%3Eemail=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`);
if(flows.length!==1)throw Error(`Erwartet wurde genau ein Onboarding, gefunden: ${flows.length}.`);
const flow=flows[0];
const [documents,acceptances,profiles,runtimeRows]=await Promise.all([
  get('legal_documents?select=id,document_type,audience,version,status,effective_from,deletion_requested_at,sandbox_onboarding_id'),
  get(`legal_acceptances?select=onboarding_id,partner_id,legal_document_id,document_version,accepted_by_email,accepted_at&onboarding_id=eq.${flow.id}`),
  get(`portal_users?select=id,role,status&id=eq.${flow.auth_user_id}`),
  get('portal_runtime_state?select=id,revision,payload&id=eq.primary'),
]);
const state=requiredLegalState({documents,acceptances,onboarding:flow,requirements:flow.required_document_types});
const rpcResponse=await fetch(`${base}/rest/v1/rpc/partner_legal_step`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_action:'READ',p_onboarding:flow.id,p_actor:flow.auth_user_id})});
const rpc=await rpcResponse.json().catch(()=>({}));
if(!rpcResponse.ok)throw Error(rpc.message||`RPC HTTP ${rpcResponse.status}`);
const runtime=runtimeRows[0]?.payload||{};
const runtimePartners=(Array.isArray(runtime.partners)?runtime.partners:[]).filter(p=>String(p.email||'').trim().toLowerCase()===email);
console.log(JSON.stringify({onboardingId:flow.id,status:flow.status,plan:flow.requested_plan,partnerType:flow.partner_type,sandboxOnly:flow.sandbox_only,profile:profiles[0]||null,runtimeRevision:runtimeRows[0]?.revision??null,runtimePartners:runtimePartners.map(p=>({id:p.id,status:p.status,plan:p.plan,role:p.role,referralOnly:p.referralOnly,partnerType:p.partnerType||p.partner_type,company:p.company})),commercialCandidates:documents.filter(d=>['PRICE_SHEET','CONDITIONS'].includes(d.document_type)).map(d=>({type:d.document_type,audience:d.audience,status:d.status,effectiveFrom:d.effective_from,sandboxOnboardingId:d.sandbox_onboarding_id,deletionPending:Boolean(d.deletion_requested_at)})),domainDocuments:state.documents.map(d=>({type:d.document_type,audience:d.audience})),domainMissingDocumentTypes:state.missingTypes,rpcVisibleDocumentTypes:(rpc.documents||[]).map(d=>d.documentType),rpcMissingDocumentTypes:rpc.missingDocumentTypes||[],accepted:rpc.accepted===true}));
