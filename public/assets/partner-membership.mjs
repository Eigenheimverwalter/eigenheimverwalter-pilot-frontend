// A subscription changes the plan, not the account's identity or ACL role.
export function partnerMembershipLabel(profile={}) {
  if(profile.referralOnly)return 'Tippgeber';
  const kind=profile.tradeId==='BROKER'?'Makler':profile.tradeName;
  return `${profile.plan==='premium'?'Premium-Partner':'Basic-Partner'}${kind?' '+kind:''}`;
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
