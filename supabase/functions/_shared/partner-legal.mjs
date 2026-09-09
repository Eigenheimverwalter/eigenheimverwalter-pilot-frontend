const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const route=new RegExp(`^/partner-onboarding/(${uuid})/legal(?:/(${uuid})/file)?$`,'i');
const fail=(message,status,code)=>{throw Object.assign(new Error(message),{status,code})};
export const partnerLegalErrors=Object.freeze({
  ONBOARDING_NOT_FOUND:['Partnerregistrierung nicht gefunden.',404],
  ONBOARDING_EXPIRED:['Die Partnerregistrierung ist abgelaufen. Bitte eine neue Einladung anfordern.',410],
  ONBOARDING_NOT_OPEN:['Diese Partnerregistrierung ist nicht mehr offen.',409],
  ONBOARDING_CHANGED:['Die Angaben wurden zwischenzeitlich geändert. Bitte neu laden.',409],
  ONBOARDING_DATA_REQUIRED:['Bitte zuerst die Unternehmens- und Kontaktdaten vervollständigen.',422],
  ACCEPTANCE_IDENTITY_MISMATCH:['Bitte mit dem bestätigten Partnerkonto dieser Registrierung anmelden.',403],
  LEGAL_ACCEPTANCE_REQUIRED:['Bitte alle erforderlichen Bestätigungen ausdrücklich setzen.',403],
  LEGAL_DOCUMENTS_UNAVAILABLE:['Die erforderlichen Rechtsdokumente sind noch nicht vollständig freigegeben.',409],
  LEGAL_VERSION_CONFLICT:['Die Rechtsdokumente wurden aktualisiert. Bitte neu laden und die aktuellen Versionen prüfen.',409],
  LEGAL_DOCUMENT_NOT_FOUND:['Diese Dokumentversion steht im Onboarding nicht zur Verfügung.',404],
});
export function assertPartnerLegalIdentity(profile,user,supportView){
  if(supportView||!profile||profile.status!=='active'||!['partner_basic','referral_partner','crafts_partner','broker_partner'].includes(profile.role)
    ||!user||profile.id!==user.id||!user.email_confirmed_at)fail('Nur das bestätigte Partnerkonto darf diesen Zustimmungsschritt verwenden. Support-Zugriffe sind ausgeschlossen.',403,'ACCEPTANCE_IDENTITY_MISMATCH');
}
export async function partnerLegalRequest({method,path,body={},profile,user,supportView=false,store,files,userAgent=''}){
  assertPartnerLegalIdentity(profile,user,supportView);
  const match=path.match(route);if(!match)fail('Onboarding-Route nicht gefunden.',404);
  if(!['GET','POST'].includes(method)||(match[2]&&method!=='GET'))fail('Methode nicht unterstützt.',405);
  if(method==='POST'&&(!Array.isArray(body?.documents)||body.documents.length>20
    ||body.documents.some(d=>!d||typeof d.id!=='string'||!new RegExp(`^${uuid}$`,'i').test(d.id)||!Number.isSafeInteger(d.version)||d.version<1||d.accepted!==true)))
    fail(...partnerLegalErrors.LEGAL_ACCEPTANCE_REQUIRED,'LEGAL_ACCEPTANCE_REQUIRED');
  // Only the verified identity and whitelisted confirmation fields cross into SQL.
  // No forwarded-for value is trusted as an IP without a verified proxy contract.
  const result=await store.step({action:method==='POST'?'ACCEPT':match[2]?'VIEW':'READ',onboardingId:match[1],actor:profile.id,
    documentId:match[2]||null,documents:method==='POST'?body.documents.map(d=>({id:d.id.toLowerCase(),version:d.version,accepted:true})):[],
    ip:null,userAgent:String(userAgent).replace(/[\x00-\x1f\x7f]/g,'').slice(0,512)});
  if(match[2]){
    const asset=result.documents.find(d=>d.id.toLowerCase()===match[2].toLowerCase());
    if(!asset||!result.file?.storage_path)fail(...partnerLegalErrors.LEGAL_DOCUMENT_NOT_FOUND,'LEGAL_DOCUMENT_NOT_FOUND');
    return{status:200,body:{url:await files.signedUrl(result.file.storage_path,60),expiresIn:60,asset}};
  }
  // Never leak storage paths or internal identity/prefill/evidence data.
  return{status:200,body:{onboardingId:result.onboardingId,onboardingStatus:result.onboardingStatus,plan:result.plan,
    documents:result.documents,missingDocumentTypes:result.missingDocumentTypes,accepted:result.accepted,dataComplete:result.dataComplete}};
}
