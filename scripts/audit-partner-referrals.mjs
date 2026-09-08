// Read-only, aggregate audit. Never print customer identities or credentials.
const project = 'rpniwtshbwjuesoeztyt';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('Pilot audit credential missing');
async function read(path) {
  const response = await fetch(`https://${project}.supabase.co/rest/v1/${path}`, {headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Read-only role audit failed (${response.status})`);
  return response.json();
}
const [{payload:state}] = await read('portal_runtime_state?select=payload&id=eq.primary');
const profiles = await read('portal_users?select=id,role,status&status=eq.active');
const identities = await read('identity_imports?select=auth_user_id,source_user_id&auth_user_id=not.is.null');
const roles = ['referral_partner','partner_basic','crafts_partner','broker_partner'];
const report = {};
for (const role of roles) {
  const accounts = profiles.filter(row => row.role === role);
  const summary = {accounts:accounts.length,linked:0,activePartner:0,missingPartner:0,missingTrade:0,withoutLicenseAreas:0,tradeCounts:{}};
  for (const account of accounts) {
    const identity = identities.find(row => row.auth_user_id === account.id);
    const partner = identity?.source_user_id && (state.partners || []).find(row => row.userId === identity.source_user_id);
    if (!partner) {summary.missingPartner++;continue;}
    summary.linked++;
    if (partner.status === 'active') summary.activePartner++;
    const referralOnly = role === 'referral_partner' || partner.referralOnly;
    if (!referralOnly && !(state.trades || []).some(row => row.id === partner.primaryTradeId)) summary.missingTrade++;
    if (!(partner.postalCodes || []).length) summary.withoutLicenseAreas++;
    const trade = referralOnly ? 'NO_TRADE' : String(partner.primaryTradeId || 'MISSING');
    summary.tradeCounts[trade] = (summary.tradeCounts[trade] || 0) + 1;
  }
  report[role] = summary;
}
console.log(JSON.stringify({project,readOnly:true,roles:report},null,2));
