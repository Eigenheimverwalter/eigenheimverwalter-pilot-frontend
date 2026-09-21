import {requiredLegalState} from '../supabase/functions/_shared/partner-onboarding.mjs';

const base=process.env.SUPABASE_URL||'https://rpniwtshbwjuesoeztyt.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const email=String(process.env.PARTNER_EMAIL||'').trim().toLowerCase();
if(!key||!email)throw Error('SUPABASE_SERVICE_ROLE_KEY und PARTNER_EMAIL sind erforderlich.');
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function get(path){const response=await fetch(`${base}/rest/v1/${path}`,{headers}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||`HTTP ${response.status}`);return data}

const flows=await get(`partner_onboardings?select=id,status,requested_plan,partner_type,sandbox_only,prefilled_data,required_document_types,created_at&prefilled_data-%3E%3Eemail=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`);
if(flows.length!==1)throw Error(`Erwartet wurde genau ein Onboarding, gefunden: ${flows.length}.`);
const flow=flows[0];
const [documents,acceptances]=await Promise.all([
  get('legal_documents?select=id,document_type,audience,version,status,effective_from,deletion_requested_at,sandbox_onboarding_id'),
  get(`legal_acceptances?select=onboarding_id,partner_id,legal_document_id,document_version,accepted_by_email,accepted_at&onboarding_id=eq.${flow.id}`),
]);
const state=requiredLegalState({documents,acceptances,onboarding:flow,requirements:flow.required_document_types});
console.log(JSON.stringify({onboardingId:flow.id,status:flow.status,plan:flow.requested_plan,partnerType:flow.partner_type,requiredAudience:state.documents[0]?.audience||null,visibleDocumentTypes:state.documents.map(d=>d.document_type),missingDocumentTypes:state.missingTypes,accepted:state.accepted}));
