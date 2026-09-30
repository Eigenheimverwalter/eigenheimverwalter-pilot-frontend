import {confirmPartnerReferral} from '../supabase/functions/_shared/referral-confirmation.mjs';

// Offline fixture builder. Never imports credentials, sends mail or creates Auth
// users. A provisioning adapter must explicitly target an isolated sandbox.
export function buildPartnerSandbox({runId=crypto.randomUUID(),now=new Date().toISOString()}={}){
  if(!/^[0-9a-f-]{36}$/.test(runId)||!Number.isFinite(Date.parse(now)))throw Error('INVALID_SANDBOX_RUN');
  const marker={sandboxRunId:runId,dataClass:'sandbox_fixture'};
  let sequence=0;
  const id=kind=>`sandbox-${runId}-${kind}-${++sequence}`;
  const state={partners:[],customers:[],properties:[],assignments:[],referralLeads:[],partnerReferralInvitations:[],trades:[{id:'ROOF',name:'Dach'},{id:'BROKER',name:'Makler'}]};
  const scenarios=[];
  for(const [name,tradeId,count] of [['basic-two','ROOF',2],['basic-limit','ROOF',3],['broker-limit','BROKER',3]]){
    const partner={...marker,id:id('partner'),userId:id('source-user'),email:`${name}-${runId}@example.invalid`,company:`TEST – ${name}`,plan:'basic',status:'active',lifecycle:'active',primaryTradeId:tradeId,tradeIds:[tradeId],postalCodes:[]};
    state.partners.push(partner);
    for(let n=1;n<=count+1;n++){
      const item={...marker,id:id('invitation'),partnerId:partner.id,name:`TEST Kunde ${n}`,email:`${name}-customer-${n}-${runId}@example.invalid`,address:`Fiktive Teststraße ${n}`,postalCode:'22043',city:'Hamburg',tradeId,status:'pending',referralOnly:false,createdAt:now,expiresAt:new Date(Date.parse(now)+7*86400000).toISOString()};
      state.partnerReferralInvitations.push(item);
      if(n<=count)confirmPartnerReferral(state,{item,partner,trade:state.trades.find(t=>t.id===tradeId),body:{accepted:true,emailConfirmed:true,addressConfirmed:true},identifier:id,now,onboardingEnabled:true});
    }
    scenarios.push({name,partnerId:partner.id,email:partner.email,confirmedProperties:count,nextInvitationId:state.partnerReferralInvitations.at(-1).id});
  }
  const collections=['partners','customers','properties','assignments','referralLeads','partnerReferralInvitations'];
  const records=[];
  for(const collection of collections)for(const row of state[collection]){
    Object.assign(row,marker);records.push({collection,id:row.id});
  }
  return{state,scenarios,manifest:{version:1,runId,environment:'sandbox',createdAt:now,records,authUserIds:[],stripeObjects:[]}};
}

// Dry-run inventory only. Unknown inbound references block deletion. Audit/legal
// evidence, Auth, documents and Stripe require separate explicit retention checks.
export function planSandboxCleanup(state,manifest){
  if(manifest?.version!==1||manifest.environment!=='sandbox'||!Array.isArray(manifest.records))throw Error('INVALID_SANDBOX_MANIFEST');
  const allowed=new Set(['partners','customers','properties','assignments','referralLeads','partnerReferralInvitations']);
  const ids=new Set(),owned=new Set(),targets=[];
  for(const entry of manifest.records){
    if(!allowed.has(entry.collection)||typeof entry.id!=='string'||!entry.id.startsWith(`sandbox-${manifest.runId}-`))throw Error('UNSAFE_SANDBOX_TARGET');
    const rows=state[entry.collection]||[],matches=rows.filter(r=>r.id===entry.id);
    if(matches.length>1)throw Error('DUPLICATE_SANDBOX_ID');
    if(!matches.length)continue;
    const row=matches[0];
    if(row.sandboxRunId!==manifest.runId||row.dataClass!=='sandbox_fixture')throw Error('SANDBOX_OWNERSHIP_MISMATCH');
    ids.add(row.id);owned.add(row);targets.push(entry);
  }
  const references=value=>typeof value==='string'?ids.has(value):Array.isArray(value)?value.some(references):value&&typeof value==='object'?Object.values(value).some(references):false;
  const blockers=[];
  for(const [collection,rows] of Object.entries(state)){
    if(Array.isArray(rows))for(const row of rows){if(!owned.has(row)&&references(row))blockers.push({collection,id:row?.id||null});}
    else if(references(rows))blockers.push({collection,id:null});
  }
  return{dryRun:true,runId:manifest.runId,targets,blockers,canDeleteRuntime:!blockers.length,
    requiresSeparateReview:['auth','storage','legal_acceptances','audit','stripe'],productionSwitch:false};
}
