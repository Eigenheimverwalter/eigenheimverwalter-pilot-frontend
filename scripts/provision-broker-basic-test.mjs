import {confirmPartnerReferral} from '../supabase/functions/_shared/referral-confirmation.mjs';
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
const email='makler_basic@ehv.test',marker='broker-basic-upsell-test-v1',sourceId='u-sandbox-broker-basic',partnerId='p-sandbox-broker-basic';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY,password=process.env.BROKER_TEST_PASSWORD;
if(!key||!password)throw Error('Test provisioning configuration missing');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'};
async function call(path,method='GET',body){const r=await fetch('https://rpniwtshbwjuesoeztyt.supabase.co'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Broker fixture operation failed: '+r.status+' '+path.split('?')[0]);return r.status===204?null:r.json();}
const [snapshot]=await call('/rest/v1/portal_runtime_state?id=eq.primary&select=payload,revision'),state=snapshot.payload;
const list=k=>(state[k]||=[]),tag={sandboxRunId:marker,dataClass:'sandbox_fixture',testAccount:email};
const matches=list('partners').filter(p=>p.email?.toLowerCase()===email);
if(matches.length>1||matches.some(p=>p.id!==partnerId||p.sandboxRunId!==marker||p.plan!=='basic'))throw Error('Existing account is not this Basic test fixture; no reset performed');
if(list('users').some(u=>(u.email?.toLowerCase()===email||u.id===sourceId)&&u.sandboxRunId!==marker))throw Error('Existing user collision');
const trade=list('trades').find(t=>t.id==='BROKER');if(!trade)throw Error('Existing broker trade unavailable');
let partner=matches[0];
if(!partner){partner={id:partnerId,userId:sourceId,email,company:'TEST Makler Basic',contact:'TEST Makler',contactName:'TEST Makler',phone:'000000000',address:'Fiktiver Testweg 1',postalCode:'22043',city:'Hamburg',primaryTradeId:'BROKER',tradeIds:['BROKER'],role:'partner_basic',partnerType:'BROKER_PARTNER',plan:'basic',cooperationLevel:'BASIC',status:'active',referralOnly:false,postalCodes:[],...tag};list('partners').push(partner);list('users').push({id:sourceId,email,name:'TEST Makler Basic',role:'partner_basic',active:true,phone:'000000000',address:partner.address,postalCode:partner.postalCode,city:partner.city,...tag});}
const now=new Date().toISOString();
for(let n=1;n<=4;n++){
 const inviteId=marker+'-invite-'+n;let invitation=list('partnerReferralInvitations').find(i=>i.id===inviteId);
 if(!invitation){invitation={id:inviteId,partnerId,name:'TEST Makler-Kunde '+n,email:`broker-basic-${n}@example.invalid`,address:`Fiktive Makler-Testadresse ${n}`,postalCode:'22043',city:'Hamburg',tradeId:'BROKER',referralOnly:false,status:'pending',createdAt:now,expiresAt:new Date(Date.now()+86400000).toISOString(),...tag};list('partnerReferralInvitations').push(invitation);const before=new Set(['customers','properties','assignments','referralLeads'].flatMap(k=>list(k).map(v=>v.id)));confirmPartnerReferral(state,{item:invitation,partner,trade,body:{accepted:true,emailConfirmed:true,addressConfirmed:true},identifier:p=>p+'-'+crypto.randomUUID(),now,onboardingEnabled:true});for(const k of ['customers','properties','assignments','referralLeads'])for(const row of list(k))if(!before.has(row.id))Object.assign(row,tag);}
 const lead=list('referralLeads').find(l=>l.sourceInvitationId===inviteId&&l.partnerId===partnerId),property=list('properties').find(p=>p.id===lead?.propertyId);if(!property||property.sandboxRunId!==marker)throw Error('Fixture ownership mismatch');
 Object.assign(property,{ehvId:'TEST-MAKLER-'+n,type:'Einfamilienhaus',year:2000,area:120,landArea:450,value:null});
 if(!list('partnerCases').some(c=>c.id===marker+'-request-'+n))list('partnerCases').push({id:marker+'-request-'+n,partnerId,propertyId:property.id,kind:'sales_mandate',createdAt:now,requestedAt:now,status:'valuation_requested',source:'sandbox_customer_request',...tag});
 if(n<=3&&!list('salesFiles').some(f=>f.id===marker+'-file-'+n))list('salesFiles').push({id:marker+'-file-'+n,partnerId,propertyId:property.id,status:'valuation_requested',requestedAt:now,createdAt:now,createdBy:sourceId,completeness:0,documents:[],...tag});
}
if(basicPropertyAllowance(state,partner,null).confirmedProperties!==3)throw Error('Expected exactly three broker test files; no data removed');
await call('/rest/v1/rpc/replace_portal_runtime_state','POST',{expected_revision:snapshot.revision,next_payload:state,audit_actor:null,audit_action:'sandbox.broker_basic_fixtures_created',audit_entity_type:'partner',audit_entity_id:partnerId,audit_metadata:{sandboxRunId:marker,noMail:true}});
const identities=await call('/rest/v1/identity_imports?email=eq.'+encodeURIComponent(email)+'&select=*');
if(identities.length>1||identities.some(i=>i.source_user_id!==sourceId||i.role!=='partner_basic'))throw Error('Unexpected identity; no permissions changed');
if(!identities.length)await call('/rest/v1/identity_imports','POST',{source_user_id:sourceId,email,display_name:'TEST Makler Basic',role:'partner_basic',active:true});
let users=[];for(let page=1;page<=30;page++){const data=await call('/auth/v1/admin/users?per_page=100&page='+page);users.push(...data.users.filter(u=>u.email?.toLowerCase()===email));if(data.users.length<100)break;if(page===30)throw Error('User enumeration incomplete');}
if(users.length>1||users.some(u=>u.user_metadata?.sandboxRunId!==marker))throw Error('Existing Auth user is not this test fixture');
const user=users.length?await call('/auth/v1/admin/users/'+users[0].id,'PUT',{password}):await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true,user_metadata:{sandboxRunId:marker}});
const authId=user.id||user.user?.id,[profile]=await call('/rest/v1/portal_users?id=eq.'+authId+'&select=role,status'),[identity]=await call('/rest/v1/identity_imports?source_user_id=eq.'+sourceId+'&select=auth_user_id');
if(profile?.role!=='partner_basic'||profile?.status!=='active'||identity?.auth_user_id!==authId)throw Error('Identity linkage verification failed');
const login=await call('/auth/v1/token?grant_type=password','POST',{email,password});if(login.user?.id!==authId)throw Error('Login verification failed');
console.log(JSON.stringify({email,loginVerified:true,plan:'basic',trade:'BROKER',salesFiles:3,valuationRequests:4,remainingRequestWithoutFile:1,noMailSent:true,otherAccountsUnchanged:true}));
