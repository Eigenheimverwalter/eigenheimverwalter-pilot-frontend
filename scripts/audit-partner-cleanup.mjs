const base='https://rpniwtshbwjuesoeztyt.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Pilot credential missing');
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function read(path){const r=await fetch(`${base}/rest/v1/${path}`,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Audit HTTP ${r.status}`);return r.json()}
const [snapshot]=await read('portal_runtime_state?select=payload,revision&id=eq.primary');
if(!snapshot?.payload)throw Error('Runtime missing');
const state=snapshot.payload,partners=Array.isArray(state.partners)?state.partners:[];
const normalize=value=>String(value||'').normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();
const keepKind=partner=>{const value=normalize(`${partner.company} ${partner.email}`);if(value.includes('dasilva'))return'da_silva';if(value.includes('kehlfinanz')||value.includes('kielfinanz'))return'kehl_finanz';if(value.includes('ivimmoverkaufhamburg')||value.includes('immoverkaufhamburg'))return'iv_immoverkauf';return null};
const keys=['partnerInvitations','partnerReferralInvitations','assignments','partnerCases','partnerOpportunities','equipmentRecords','salesFiles','licenseAssignments','partnerLicenses','partnerContracts','serviceRecords','documents'];
const rows=partners.map(partner=>({company:partner.company||'(ohne Name)',status:partner.status||null,plan:partner.plan||null,preserveAs:keepKind(partner),hasUser:Boolean(partner.userId),dependencies:Object.fromEntries(keys.map(k=>[k,(Array.isArray(state[k])?state[k]:[]).filter(x=>x.partnerId===partner.id||x.organizationId===partner.organizationId).length]))}));
const dependencyScore=row=>Object.values(row.dependencies).reduce((sum,value)=>sum+Number(value||0),0);
const preserve=[];
for(const kind of ['da_silva','kehl_finanz','iv_immoverkauf']){
  const candidates=rows.filter(row=>row.preserveAs===kind).sort((a,b)=>dependencyScore(b)-dependencyScore(a));
  if(!candidates.length)throw Error(`Missing preservation target: ${kind}`);
  preserve.push(candidates[0]);
}
const preserveSet=new Set(preserve),remove=rows.filter(x=>!preserveSet.has(x));
const preserveKinds=new Set(preserve.map(x=>x.preserveAs));
if(preserve.length!==3||preserveKinds.size!==3)throw Error(`Preservation set is not exact: ${JSON.stringify(preserve)}`);
console.log(JSON.stringify({readOnly:true,revision:snapshot.revision,totalPartners:rows.length,preserve,remove,removeCount:remove.length,adminUntouched:true},null,2));
