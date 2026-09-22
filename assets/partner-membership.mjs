// A subscription changes the plan, not the account's identity or ACL role.
export function partnerMembershipLabel(profile={}) {
  if(profile.referralOnly)return 'Tippgeber';
  const kind=profile.tradeId==='BROKER'?'Makler':profile.tradeName;
  return `${profile.plan==='premium'?'Premium-Partner':'Basic-Partner'}${kind?' '+kind:''}`;
}
export function partnerDirectoryLabels(profile={}) {
  const broker=String(profile.tradeId||'').toUpperCase()==='BROKER'||String(profile.partnerCategory||'').toLowerCase()==='broker';
  const trade=broker?'Immobilienmakler':profile.tradeName||profile.tradeId||'';
  if(profile.referralOnly)return {role:'Basic-Tippgeber',trade:'Kein Gewerk · allgemeine Empfehlung'};
  if(profile.plan==='basic')return {role:broker?'Basic Makler':'Basic Handwerker',trade:trade||'Gewerk noch nicht hinterlegt'};
  return {role:profile.roleTitle||'Rolle noch nicht zugeordnet',trade:trade||'Gewerk noch nicht hinterlegt'};
}
export function applyPartnerMembership(profile,root=document) {
  const label=partnerMembershipLabel(profile);
  const role=root.querySelector('#user-role');
  if(role)role.textContent=label+(globalThis.window?.ehvPortalContext?.supportView?' · Support-Sicht':'');
  const heading=root.querySelector('#section-label');
  if(heading?.textContent.includes('PARTNER BASIC'))heading.textContent=label.toUpperCase();
  for(const kicker of root.querySelectorAll('#content .hero .kicker')) {
    if(kicker.textContent.includes('PARTNER BASIC'))kicker.textContent=kicker.textContent.replace('PARTNER BASIC',label.toUpperCase());
  }
}
