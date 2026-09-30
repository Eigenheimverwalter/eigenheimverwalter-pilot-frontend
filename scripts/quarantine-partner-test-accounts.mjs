const base='https://rpniwtshbwjuesoeztyt.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key||process.env.PARTNER_QUARANTINE_CONFIRM!=='QUARANTINE_ALL_EXCEPT_3')throw Error('Quarantine authorization missing');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function call(path,{method='GET',body,prefer}={}){const r=await fetch(`${base}${path}`,{method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${method} ${path.split('?')[0]} HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);const text=await r.text();return text?JSON.parse(text):null}
const list=v=>Array.isArray(v)?v:[],normalize=v=>String(v||'').normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();
const kind=p=>{const v=normalize(`${p.company} ${p.email}`);if(v.includes('dasilva'))return'da_silva';if(v.includes('kehlfinanz')||v.includes('kielfinanz'))return'kehl_finanz';if(v.includes('immoverkaufhamburg'))return'iv_immoverkauf';return null};
const [snapshot]=await call('/rest/v1/portal_runtime_state?select=payload,revision&id=eq.primary');
const state=snapshot?.payload;if(!state)throw Error('Runtime missing');
const partners=list(state.partners),dependencyKeys=['partnerInvitations','partnerReferralInvitations','assignments','partnerCases','partnerOpportunities','equipmentRecords','salesFiles','licenseAssignments','partnerLicenses','partnerContracts','serviceRecords','documents'];
const score=p=>dependencyKeys.reduce((sum,k)=>sum+list(state[k]).filter(x=>x.partnerId===p.id||x.organizationId===p.organizationId).length,0);
const keep=[];for(const target of ['da_silva','kehl_finanz','iv_immoverkauf']){const candidates=partners.filter(p=>kind(p)===target).sort((a,b)=>score(b)-score(a));if(!candidates.length)throw Error(`Missing protected partner ${target}`);keep.push(candidates[0])}
if(keep.length!==3||new Set(keep.map(p=>p.id)).size!==3)throw Error('Protected partner set is not exact');
const keepIds=new Set(keep.map(p=>p.id)),removed=partners.filter(p=>!keepIds.has(p.id));
if(removed.length!==29)throw Error(`Expected 29 test partners, found ${removed.length}`);
const removedIds=new Set(removed.map(p=>String(p.id))),removedUsers=new Set(removed.map(p=>String(p.userId||'')).filter(Boolean));
const keptOrganizations=new Set(keep.map(p=>String(p.organizationId||'')).filter(Boolean));
const removedOrganizations=new Set(removed.map(p=>String(p.organizationId||'')).filter(id=>id&&!keptOrganizations.has(id)));
const targets=new Set([...removedIds,...removedUsers,...removedOrganizations]);
const containsTarget=value=>{const seen=new Set();const walk=v=>{if(typeof v==='string')return targets.has(v);if(!v||typeof v!=='object'||seen.has(v))return false;seen.add(v);return Array.isArray(v)?v.some(walk):Object.values(v).some(walk)};return walk(value)};
const next=structuredClone(state),bundle={id:`partner-cleanup-${new Date().toISOString()}`,createdAt:new Date().toISOString(),reason:'Administrator-authorized test partner cleanup',partners:removed,collections:{}};
for(const [name,value] of Object.entries(next))if(Array.isArray(value)&&name!=='partnerCleanupQuarantine'){const quarantined=value.filter(containsTarget);if(quarantined.length)bundle.collections[name]=quarantined;next[name]=value.filter(item=>!containsTarget(item))}
next.partners=keep;
next.partnerOrganizations=list(state.partnerOrganizations).filter(row=>!removedOrganizations.has(String(row.id)));
next.users=list(state.users).filter(row=>!removedUsers.has(String(row.id)));
next.partnerCleanupQuarantine=[...list(state.partnerCleanupQuarantine),bundle];
const identities=[];for(const sourceId of removedUsers)identities.push(...await call(`/rest/v1/identity_imports?select=source_user_id,auth_user_id,role&source_user_id=eq.${encodeURIComponent(sourceId)}`));
const authIds=[...new Set(identities.map(row=>row.auth_user_id).filter(Boolean))];
if(authIds.length){const profiles=[];for(const id of authIds)profiles.push(...await call(`/rest/v1/portal_users?select=id,role,status&id=eq.${id}`));const permitted=new Set(['partner_basic','referral_partner','crafts_partner','broker_partner']);if(profiles.some(p=>!permitted.has(p.role)))throw Error('Quarantine would touch a non-partner portal role')}
await call('/rest/v1/rpc/replace_portal_runtime_state',{method:'POST',body:{expected_revision:snapshot.revision,next_payload:next,audit_actor:null,audit_action:'partner.test_accounts.quarantined',audit_entity_type:'partner_cleanup',audit_entity_id:bundle.id,audit_metadata:{quarantinedPartners:removed.length,disabledUsers:authIds.length,preservedPartners:3,reversible:true}},prefer:'return=representation'});
for(const identity of identities)await call(`/rest/v1/identity_imports?source_user_id=eq.${encodeURIComponent(identity.source_user_id)}`,{method:'PATCH',body:{active:false,activation_status:'blocked'}});
for(const authId of authIds)await call(`/rest/v1/portal_users?id=eq.${authId}`,{method:'PATCH',body:{status:'disabled'}});
for(const partnerId of removedIds){
  const flows=await call(`/rest/v1/partner_onboardings?select=id,status&or=${encodeURIComponent(`(partner_id.eq.${partnerId},existing_partner_id.eq.${partnerId})`)}`);for(const flow of flows)if(!['ACTIVE','CANCELLED','EXPIRED'].includes(flow.status))await call(`/rest/v1/partner_onboardings?id=eq.${flow.id}`,{method:'PATCH',body:{status:'CANCELLED'}});
  const domainPartners=await call(`/rest/v1/partners?select=id,status&source_id=eq.${encodeURIComponent(partnerId)}`);for(const row of domainPartners)await call(`/rest/v1/partners?id=eq.${row.id}`,{method:'PATCH',body:{status:'disabled'}});
}
const [after]=await call('/rest/v1/portal_runtime_state?select=payload,revision&id=eq.primary');
const remaining=list(after.payload?.partners);if(remaining.length!==3||remaining.some(p=>!kind(p)))throw Error('Post-quarantine verification failed');
console.log(JSON.stringify({completed:true,reversible:true,quarantinedPartners:removed.length,disabledPartnerAccounts:authIds.length,remainingPartners:remaining.map(p=>p.company),revision:after.revision,adminUntouched:true}));
