// Read-only checks through the authorized support view: no partner login,
// password reset, role change or customer mutation.
const project='rpniwtshbwjuesoeztyt',base=`https://${project}.supabase.co`;
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY,session=process.env.PILOT_SMOKE_ACCESS_TOKEN;
if(!secret||!session)throw Error('Basic access smoke credentials missing');
async function read(path,headers){const response=await fetch(base+path,{headers,signal:AbortSignal.timeout(20000)});return{status:response.status,body:await response.json()};}
const serviceHeaders={apikey:secret,Authorization:`Bearer ${secret}`};
const accounts=await read('/rest/v1/portal_users?select=id,role,status&status=eq.active&role=in.(partner_basic,referral_partner)',serviceHeaders);
const identities=await read('/rest/v1/identity_imports?select=auth_user_id,email&auth_user_id=not.is.null',serviceHeaders);
if(accounts.status!==200||identities.status!==200)throw Error('Read-only account lookup failed');
let tested=0,antonioAccounts=0;const roles={};
for(const account of accounts.body){
  const headers={Authorization:`Bearer ${session}`,Origin:'https://eigenheimverwalter.github.io','x-ehv-support-user':account.id};
  const me=await read('/functions/v1/portal-api/me',headers),dashboard=await read('/functions/v1/portal-api/partner-basic/dashboard',headers),referral=await read('/functions/v1/portal-api/referral',headers),protectedData=await read('/functions/v1/portal-api/production/customers',headers);
  if(me.status!==200||me.body.user?.id!==account.id||me.body.user?.role!==account.role||!me.body.supportView?.readOnly)throw Error('Basic identity scope failed');
  if(dashboard.status!==200||!dashboard.body.partner?.id||!Array.isArray(dashboard.body.regions)||!Array.isArray(dashboard.body.recent))throw Error(`Basic dashboard failed: ${dashboard.status}`);
  if(referral.status!==200||referral.body.partner?.id!==dashboard.body.partner.id||!referral.body.partner.canRecommend||!referral.body.link?.startsWith('/ref/'))throw Error('Basic referral access failed');
  if(protectedData.status!==403)throw Error('Basic must not access administrator customer data');
  tested++;roles[account.role]=(roles[account.role]||0)+1;
  const identity=identities.body.find(row=>row.auth_user_id===account.id);if(String(identity?.email||'').toLowerCase().startsWith('antonio.silva@'))antonioAccounts++;
}
console.log(JSON.stringify({project,readOnly:true,basicAccountsTested:tested,roles,antonioAccountsVerified:antonioAccounts,dashboard:true,referral:true,adminDataBlocked:true}));
