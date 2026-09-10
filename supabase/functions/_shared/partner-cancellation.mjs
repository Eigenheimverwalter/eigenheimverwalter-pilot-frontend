export const CANCELLATION_NOTICE='Nach Vertragsende löschen wir Ihre nicht mehr benötigten partnerbezogenen personenbezogenen Daten endgültig. Gesetzlich aufzubewahrende Unterlagen, insbesondere Steuer- und Buchungsunterlagen sowie erforderliche Behörden- und Rechtsnachweise, bleiben zweckgebunden für die geltenden Fristen gespeichert und werden anschließend gelöscht. Kunden- und Immobilienakten, die den Eigentümern weiterhin zustehen, bleiben erhalten. Eine sofortige Löschung sämtlicher Daten erfolgt nicht.';
export const partnerCancellationRoles=['partner_basic','referral_partner','crafts_partner','broker_partner'];
export function assertCancellationActor(profile,partner,support=false){
  if(support||profile.status!=='active'||!partnerCancellationRoles.includes(profile.role)||!partner?.id)throw Object.assign(new Error('Die Kündigung ist ausschließlich im eigenen Partnerkonto möglich.'),{status:403});
}
const dateString=d=>d.toISOString().slice(0,10);
const addMonths=(value,count)=>{const d=new Date(value+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+count);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return dateString(d)};
export function cancellationTerms(partner,now=new Date()){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const plan=String(partner.plan||partner.cooperationLevel||'').toLowerCase();
  const premium=plan==='premium'||Boolean(partner.license?.stripeSubscriptionId);
  if(!premium&&plan!=='basic'&&partner.referralOnly!==true)throw Object.assign(new Error('Die Kooperationsart muss vor der Kündigung durch die Verwaltung geprüft werden.'),{status:409});
  if(!premium){const after=addMonths(today,1),d=new Date(after+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);return {plan:'basic',effectiveDate:dateString(d),noticeMonths:1,rule:'Ein Monat zum Monatsende',notice:CANCELLATION_NOTICE};}
  const license=partner.license||{},end=license.contractEnd||partner.contractEnd;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||Number.isNaN(Date.parse(end)))throw Object.assign(new Error('Das Vertragsende muss vor der Kündigung durch die Verwaltung geprüft werden.'),{status:409});
  const months=license.cancelNoticeMonths??3,renew=license.autoRenewMonths??12;
  if(!Number.isInteger(months)||months<0||months>12||!Number.isInteger(renew)||renew<1||renew>24)throw Object.assign(new Error('Die Vertragsfristen müssen geprüft werden.'),{status:409});
  let effective=end;for(let n=0;today>addMonths(effective,-months)&&n<100;n++)effective=addMonths(effective,renew);
  if(today>addMonths(effective,-months))throw Object.assign(new Error('Vertragsende nicht eindeutig.'),{status:409});
  return {plan:'premium',effectiveDate:effective,noticeMonths:months,deadline:addMonths(effective,-months),rule:`${months} Monate vor Vertragsende; Verlängerung um ${renew} Monate`,notice:CANCELLATION_NOTICE};
}
export function assertCancellationConfirmation(body,terms){
  if(body.confirmPartnership!==true||body.acknowledgeDeletion!==true||body.confirmation!=='KÜNDIGEN')throw Object.assign(new Error('Bitte beide Hinweise bestätigen und KÜNDIGEN eingeben.'),{status:422});
  if(body.effectiveDate!==terms.effectiveDate)throw Object.assign(new Error('Der Kündigungstermin hat sich geändert. Bitte neu prüfen und bestätigen.'),{status:409});
}
