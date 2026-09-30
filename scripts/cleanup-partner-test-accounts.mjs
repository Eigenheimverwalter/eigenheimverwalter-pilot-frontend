const base='https://rpniwtshbwjuesoeztyt.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key||process.env.PARTNER_CLEANUP_CONFIRM!=='DELETE_ALL_EXCEPT_3')throw Error('Cleanup authorization missing');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function call(path,{method='GET',body,prefer}={}){const r=await fetch(`${base}${path}`,{method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${method} ${path.split('?')[0]} HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);const text=await r.text();return text?JSON.parse(text):null}
const list=v=>Array.isArray(v)?v:[],normalize=v=>String(v||'').normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();
const kind=p=>{const v=normalize(`${p.company} ${p.email}`);if(v.includes('dasilva'))return'da_silva';if(v.includes('kehlfinanz')||v.includes('kielfinanz'))return'kehl_finanz';if(v.includes('immoverkaufhamburg'))return'iv_immoverkauf';return null};
const [snapshot]=await call('/rest/v1/portal_runtime_state?select=payload,revision&id=eq.primary');
const state=snapshot?.payload;if(!state)throw Error('Runtime missing');
const partners=list(state.partners),keys=['partnerInvitations','partnerReferralInvitations','assignments','partnerCases','partnerOpportunities','equipmentRecords','salesFiles','licenseAssignments','partnerLicenses','partnerContracts','serviceRecords','documents'];
const score=p=>keys.reduce((sum,k)=>sum+list(state[k]).filter(x=>x.partnerId===p.id||x.organizationId===p.organizationId).length,0);
const keep=[];for(const target of ['da_silva','kehl_finanz','iv_immoverkauf']){const candidates=partners.filter(p=>kind(p)===target).sort((a,b)=>score(b)-score(a));if(!candidates.length)throw Error(`Missing protected partner ${target}`);keep.push(candidates[0])}
if(keep.length!==3||new Set(keep.map(p=>p.id)).size!==3)throw Error('Protected partner set is not exact');
const keepIds=new Set(keep.map(p=>p.id)),removed=partners.filter(p=>!keepIds.has(p.id));
if(removed.length!==partners.length-3||removed.length<1)throw Error('Unexpected cleanup scope');
const removedIds=new Set(removed.map(p=>String(p.id))),removedUsers=new Set(removed.map(p=>String(p.userId||'')).filter(Boolean));
const keptOrganizations=new Set(keep.map(p=>String(p.organizationId||'')).filter(Boolean));
const removedOrganizations=new Set(removed.map(p=>String(p.organizationId||'')).filter(id=>id&&!keptOrganizations.has(id)));
const targets=new Set([...removedIds,...removedUsers,...removedOrganizations]);
const containsTarget=value=>{const seen=new Set();const walk=v=>{if(typeof v==='string')return targets.has(v);if(!v||typeof v!=='object'||seen.has(v))return false;seen.add(v);return Array.isArray(v)?v.some(walk):Object.values(v).some(walk)};return walk(value)};
const next=structuredClone(state);
for(const [name,value] of Object.entries(next))if(Array.isArray(value))next[name]=value.filter(item=>!containsTarget(item));
next.partners=keep;
next.partnerOrganizations=list(state.partnerOrganizations).filter(row=>!removedOrganizations.has(String(row.id)));
next.users=list(state.users).filter(row=>!removedUsers.has(String(row.id)));
const identities=[];
for(const sourceId of removedUsers)identities.push(...await call(`/rest/v1/identity_imports?select=source_user_id,auth_user_id,role&source_user_id=eq.${encodeURIComponent(sourceId)}`));
const authIds=[...new Set(identities.map(row=>row.auth_user_id).filter(Boolean))];
if(authIds.length){const encoded=`(${authIds.join(',')})`;const profiles=await call(`/rest/v1/portal_users?select=id,role&id=in.${encodeURIComponent(encoded)}`);const permitted=new Set(['partner_basic','referral_partner','crafts_partner','broker_partner']);if(profiles.some(p=>!permitted.has(p.role)))throw Error('Cleanup would touch a non-partner portal role')}
await call('/rest/v1/rpc/replace_portal_runtime_state',{method:'POST',body:{expected_revision:snapshot.revision,next_payload:next,audit_actor:null,audit_action:'partner.test_accounts.purged',audit_entity_type:'partner_cleanup',audit_entity_id:'all_except_3',audit_metadata:{removedPartners:removed.length,removedUsers:removedUsers.size,preservedPartners:3}},prefer:'return=representation'});
// Remove central onboarding/payment/legal rows belonging exclusively to removed runtime partners.
for(const partnerId of removedIds){
  await call(`/rest/v1/partner_cancellations?partner_id=eq.${encodeURIComponent(partnerId)}`,{method:'DELETE'});
  const flows=await call(`/rest/v1/partner_onboardings?select=id&or=${encodeURIComponent(`(partner_id.eq.${partnerId},existing_partner_id.eq.${partnerId})`)}`);
  for(const flow of flows){const attempts=await call(`/rest/v1/partner_checkout_attempts?select=id&onboarding_id=eq.${flow.id}`);for(const attempt of attempts)await call(`/rest/v1/partner_payment_events?attempt_id=eq.${attempt.id}`,{method:'DELETE'});await call(`/rest/v1/partner_checkout_attempts?onboarding_id=eq.${flow.id}`,{method:'DELETE'});await call(`/rest/v1/legal_acceptances?onboarding_id=eq.${flow.id}`,{method:'DELETE'});await call(`/rest/v1/legal_documents?sandbox_onboarding_id=eq.${flow.id}`,{method:'PATCH',body:{sandbox_onboarding_id:null}});await call(`/rest/v1/partner_onboardings?id=eq.${flow.id}`,{method:'DELETE'})}
  const domainPartners=await call(`/rest/v1/partners?select=id&source_id=eq.${encodeURIComponent(partnerId)}`);
  for(const row of domainPartners){await call(`/rest/v1/partner_opportunities?partner_id=eq.${row.id}`,{method:'DELETE'});await call(`/rest/v1/offers?partner_id=eq.${row.id}`,{method:'DELETE'});await call(`/rest/v1/service_records?partner_id=eq.${row.id}`,{method:'PATCH',body:{partner_id:null}});await call(`/rest/v1/service_cases?partner_id=eq.${row.id}`,{method:'PATCH',body:{partner_id:null}});await call(`/rest/v1/partners?id=eq.${row.id}`,{method:'DELETE'})}
}
// Remove imported identities, portal profiles and Auth accounts only after the
// runtime no longer grants them partner access.
for(const identity of identities)await call(`/rest/v1/identity_imports?source_user_id=eq.${encodeURIComponent(identity.source_user_id)}`,{method:'DELETE'});
for(const authId of authIds){await call(`/rest/v1/portal_users?id=eq.${authId}`,{method:'DELETE'});await call(`/auth/v1/admin/users/${authId}`,{method:'DELETE'})}
const [after]=await call('/rest/v1/portal_runtime_state?select=payload,revision&id=eq.primary');
const remaining=list(after.payload?.partners);if(remaining.length!==3||remaining.some(p=>!kind(p)))throw Error('Post-cleanup verification failed');
console.log(JSON.stringify({completed:true,removedPartners:removed.length,removedPartnerAccounts:authIds.length,remainingPartners:remaining.map(p=>p.company),revision:after.revision,adminUntouched:true}));
