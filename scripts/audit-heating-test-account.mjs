// Explicit user-selected account only; read-only and no credentials/PII dump.
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
const base='https://rpniwtshbwjuesoeztyt.supabase.co',key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Pilot credential missing');
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function read(path){const r=await fetch(base+'/rest/v1/'+path,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Account audit HTTP '+r.status);return r.json();}
const [snapshot]=await read('portal_runtime_state?select=payload,revision&id=eq.primary');
const state=snapshot.payload;
const matches=(state.partners||[]).filter(p=>String(p.email||'').trim().toLowerCase()==='basic.heizung@ehv.test');
if(matches.length!==1)throw Error('Expected exactly one heating test partner; found '+matches.length);
const partner=matches[0];
const identities=await read('identity_imports?select=auth_user_id&source_user_id=eq.'+encodeURIComponent(partner.userId));
if(identities.length!==1||!identities[0].auth_user_id)throw Error('Test account identity not uniquely linked');
const profiles=await read('portal_users?select=role,status&id=eq.'+encodeURIComponent(identities[0].auth_user_id));
const trade=(state.trades||[]).find(t=>t.id===partner.primaryTradeId);
console.log(JSON.stringify({readOnly:true,target:'heating-test',matches:matches.length,partnerStatus:partner.status,plan:partner.plan,
  referralOnly:partner.referralOnly===true,tradeId:partner.primaryTradeId,tradeName:trade?.name,profile:profiles[0],
  capacity:basicPropertyAllowance(state,partner,null),activeAssignments:(state.assignments||[]).filter(a=>a.partnerId===partner.id&&a.status==='active').length,
  adminUntouched:true}));
