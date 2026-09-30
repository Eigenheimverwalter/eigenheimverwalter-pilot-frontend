import {confirmPartnerReferral} from '../supabase/functions/_shared/referral-confirmation.mjs';
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
const base='https://rpniwtshbwjuesoeztyt.supabase.co',email='basic.heizung@ehv.test';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY,password=process.env.HEATING_TEST_PASSWORD;
if(!key||!password)throw Error('Provisioning credentials missing');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function call(path,method='GET',body){const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Provisioning HTTP '+r.status+' '+path.split('?')[0]);return r.status===204?null:r.json();}
const [snapshot]=await call('/rest/v1/portal_runtime_state?id=eq.primary&select=payload,revision');
const state=snapshot.payload,partners=(state.partners||[]).filter(p=>String(p.email).toLowerCase()===email);
if(partners.length!==1)throw Error('Heating partner not unique');
const partner=partners[0];
if(partner.plan!=='basic'||partner.status!=='active'||partner.primaryTradeId!=='EQUIP_HEIZUNG'||partner.referralOnly)throw Error('Unexpected heating partner configuration');
const imports=await call('/rest/v1/identity_imports?source_user_id=eq.'+encodeURIComponent(partner.userId)+'&select=auth_user_id,email,role,active');
if(imports.length!==1||imports[0].email.toLowerCase()!==email||imports[0].role!=='partner_basic'||!imports[0].active)throw Error('Unsafe identity mapping');
let users=[];
for(let page=1;page<=30;page++){const data=await call('/auth/v1/admin/users?per_page=100&page='+page);users.push(...data.users.filter(u=>u.email?.toLowerCase()===email));if(data.users.length<100)break;if(page===30)throw Error('Pagination incomplete');}
if(users.length>1)throw Error('Ambiguous Auth account');
if(users.length&&imports[0].auth_user_id!==users[0].id)throw Error('Existing Auth mapping requires reconciliation');
const user=users.length?await call('/auth/v1/admin/users/'+users[0].id,'PUT',{password}):await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true,user_metadata:{purpose:'user_authorized_heating_test'}});
const authId=user.id||user.user?.id;
if(!authId)throw Error('Auth creation not confirmed');
const [profile]=await call('/rest/v1/portal_users?id=eq.'+authId+'&select=role,status');
const [linked]=await call('/rest/v1/identity_imports?source_user_id=eq.'+encodeURIComponent(partner.userId)+'&select=auth_user_id');
if(profile?.role!=='partner_basic'||profile?.status!=='active'||linked?.auth_user_id!==authId)throw Error('Auth trigger linkage not confirmed');
const before=basicPropertyAllowance(state,partner,null).confirmedProperties;
if(before>3)throw Error('Existing capacity exceeds test target; no data removed');
const marker='heating-upsell-test-v1',now=new Date().toISOString(),trade=state.trades.find(t=>t.id==='EQUIP_HEIZUNG');
if(!trade)throw Error('Heating catalogue entry missing');
for(let n=before+1;n<=3;n++){
  const item={id:crypto.randomUUID(),partnerId:partner.id,name:'TEST Heizungs-Kunde '+n,email:`heating-upsell-${n}@example.invalid`,address:`Fiktive Testadresse ${n}`,postalCode:'22043',city:'Hamburg',tradeId:trade.id,referralOnly:false,status:'pending',createdAt:now,expiresAt:new Date(Date.now()+86400000).toISOString()};
  const arrays=['customers','properties','assignments','referralLeads','partnerReferralInvitations'];
  const ids=new Set(arrays.flatMap(k=>(state[k]||[]).map(r=>r.id)));
  (state.partnerReferralInvitations||=[]).push(item);
  confirmPartnerReferral(state,{item,partner,trade,body:{accepted:true,emailConfirmed:true,addressConfirmed:true},identifier:p=>'sandbox-heating-'+p+'-'+crypto.randomUUID(),now,onboardingEnabled:true});
  for(const k of arrays)for(const row of state[k]||[])if(!ids.has(row.id))Object.assign(row,{sandboxRunId:marker,dataClass:'sandbox_fixture',testAccount:email});
}
if(before<3)await call('/rest/v1/rpc/replace_portal_runtime_state','POST',{expected_revision:snapshot.revision,next_payload:state,audit_actor:authId,audit_action:'sandbox.heating_fixtures_created',audit_entity_type:'partner',audit_entity_id:partner.id,audit_metadata:{sandboxRunId:marker,added:3-before,noMail:true}});
const [after]=await call('/rest/v1/portal_runtime_state?id=eq.primary&select=payload');
if(basicPropertyAllowance(after.payload,partner,null).confirmedProperties!==3)throw Error('Fixture verification failed');
const session=await call('/auth/v1/token?grant_type=password','POST',{email,password});
if(session.user?.id!==authId||!session.access_token)throw Error('Password login verification failed');
console.log(JSON.stringify({loginVerified:true,role:profile.role,confirmedOwnProperties:3,added:3-before,noMailSent:true,adminUnchanged:true,premium:false,paymentReady:false}));
