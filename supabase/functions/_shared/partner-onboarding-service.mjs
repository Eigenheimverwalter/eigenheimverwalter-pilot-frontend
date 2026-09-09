import {normalizeOnboardingInput, missingOnboardingData, onboardingError} from './partner-onboarding.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const partnerRoles=['partner_basic','referral_partner','crafts_partner','broker_partner'];
const requireValue=(ok,code,status=422)=>{if(!ok)throw onboardingError(code,status)};
export const onboardingServiceErrors={
  ONBOARDING_PERMISSION_DENIED:['Keine Berechtigung für diese Partnerregistrierung.',403],
  ONBOARDING_NOT_FOUND:['Partnerregistrierung nicht gefunden.',404],
  ONBOARDING_EXPIRED:['Die Partnerregistrierung ist abgelaufen.',410],
  ONBOARDING_NOT_OPEN:['Diese Partnerregistrierung kann nicht mehr bearbeitet werden.',409],
  ONBOARDING_CHANGED:['Die Angaben wurden zwischenzeitlich geändert. Bitte neu laden.',409],
  ONBOARDING_IDENTITY_MISMATCH:['Bitte mit dem bestätigten Konto der eingeladenen E-Mail-Adresse anmelden.',403],
  ONBOARDING_DUPLICATE:['Für diese E-Mail-Adresse besteht bereits eine offene Partnerregistrierung.',409],
  ONBOARDING_SOURCE_CONFLICT:['Diese Quelle ist bereits mit einer anderen Partnerregistrierung verknüpft.',409],
  ONBOARDING_PARTNER_LINK_REQUIRED:['Der bestehende Partner muss für diesen Vorgang zugeordnet werden.',409],
  ONBOARDING_DATA_LOCKED:['Die bestätigten Vertragsdaten können in diesem Schritt nicht mehr geändert werden.',409],
  ONBOARDING_INPUT_INVALID:['Die Angaben zur Partnerregistrierung sind ungültig.',422],
  INVALID_ENTRY_SOURCE:['Diese Einstiegsquelle ist ungültig.',422],
  COOPERATION_LEVEL_REQUIRED:['Bitte Basic oder Premium auswählen.',422],
  PARTNER_TYPE_REQUIRED:['Bitte einen gültigen Partnertyp auswählen.',422],
  EQUIPMENT_TYPE_REQUIRED:['Bitte ein freigegebenes Gewerk auswählen.',422],
  SALES_LEAD_REQUIRED:['Die SalesOS-Leadreferenz fehlt.',422],
  ENTRY_PLAN_MISMATCH:['Einstieg und Kooperationsart passen nicht zusammen.',422],
};
export const hashOnboardingToken=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export function onboardingSummary(flow){
  const status=flow.status,missing=missingOnboardingData(flow.prefilled_data);
  const next_step=['CREATED','INVITED'].includes(status)?'START':['STARTED','DATA_INCOMPLETE'].includes(status)?'DATA':
    ['DATA_COMPLETE','LEGAL_PENDING'].includes(status)?'LEGAL':status==='LEGAL_ACCEPTED'?(flow.requested_plan==='PREMIUM'?'CHECKOUT':'ACTIVATION_PENDING'):
    ['CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED'].includes(status)?'PAYMENT':status==='ACTIVE'?'COMPLETE':status==='READY_FOR_ACTIVATION'?'ACTIVATION_PENDING':'CLOSED';
  return{onboarding_id:flow.id,onboarding_status:status,next_step,version:flow.version,source:flow.source,
    partner_id:flow.partner_id||flow.existing_partner_id||null,requested_plan:flow.requested_plan,partner_type:flow.partner_type,
    equipment_type:flow.equipment_type||null,prefilled_data:flow.prefilled_data,missing_fields:missing,expires_at:flow.expires_at};
}

// A single server-side orchestration service. Entry adapters authenticate their
// source first; the store independently checks permissions, ownership and races.
// This service deliberately cannot write ACTIVE, licences or payment success.
export class PartnerOnboardingService {
  constructor({store,trades=[]}){this.store=store;this.trades=trades;}
  async create(input,{actorId=null,source}={}){
    requireValue(source&&source===input.source,'ONBOARDING_PERMISSION_DENIED',403);
    const normalized=normalizeOnboardingInput(input,this.trades);
    requireValue(!missingOnboardingData(normalized.prefilled_data).includes('email'),'ONBOARDING_INPUT_INVALID');
    requireValue(typeof input.request_key==='string'&&uuid.test(input.request_key),'ONBOARDING_INPUT_INVALID');
    const token=newToken();
    const result=await this.store.create({actorId,input:{...normalized,request_key:input.request_key.toLowerCase()},tokenHash:await hashOnboardingToken(token)});
    return{...onboardingSummary(result.flow),created:result.created,
      // On idempotent replays never overwrite/reveal the existing invitation.
      secure_onboarding_token:result.created?token:null};
  }
  async step(action,id,{actorId,token=null,version=null,data={}}={}){
    requireValue(uuid.test(String(id)),'ONBOARDING_NOT_FOUND',404);
    requireValue(['READ','START','SAVE_DATA','CANCEL'].includes(action),'ONBOARDING_INPUT_INVALID');
    requireValue(uuid.test(String(actorId)),'ONBOARDING_PERMISSION_DENIED',403);
    if(['SAVE_DATA','CANCEL'].includes(action))requireValue(Number.isSafeInteger(version)&&version>0,'ONBOARDING_CHANGED',409);
    if(token!==null)requireValue(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'ONBOARDING_NOT_FOUND',404);
    const values={};
    if(action==='SAVE_DATA'){
      requireValue(data&&typeof data==='object'&&!Array.isArray(data),'ONBOARDING_INPUT_INVALID');
      for(const [key,max] of Object.entries({company:180,contact_name:120,phone:50,address:180,postal_code:5,city:100})){
        requireValue(typeof data[key]==='string'&&data[key].length<=max,'ONBOARDING_INPUT_INVALID');
        values[key]=data[key].normalize('NFKC').trim();
        requireValue(values[key].length<=max&&!/[\x00-\x1f\x7f]/.test(values[key]),'ONBOARDING_INPUT_INVALID');
      }
      // Email/plan/role/equipment/partner IDs are immutable here. A request cannot
      // replace ownership, undermine an accepted document or choose its status.
      requireValue(!Object.keys(data).some(k=>!(k in values)),'ONBOARDING_INPUT_INVALID');
    }
    const flow=await this.store.step({action,id,actorId,tokenHash:token?await hashOnboardingToken(token):null,version,data:values});
    return onboardingSummary(flow);
  }
  async confirmInvitation(id,{actorId=null,deliveryReference}={}){
    requireValue(uuid.test(String(id))&&typeof deliveryReference==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(deliveryReference),'ONBOARDING_INPUT_INVALID');
    // Called only by the authenticated entry adapter after the existing mail
    // outbox has a confirmed send. No browser endpoint and no second outbox.
    return onboardingSummary(await this.store.invited({id,actorId,deliveryReference}));
  }
}

export async function partnerOnboardingRequest({method,path,body={},profile,user,supportView=false,service}){
  requireValue(!supportView&&profile?.status==='active'&&user?.id===profile?.id&&user?.email_confirmed_at,'ONBOARDING_PERMISSION_DENIED',403);
  requireValue(body&&typeof body==='object'&&!Array.isArray(body),'ONBOARDING_INPUT_INVALID');
  if(path==='/partner-onboarding'&&method==='POST'){
    const own=partnerRoles.includes(profile.role);
    requireValue(own||['super_admin','admin_light'].includes(profile.role),'ONBOARDING_PERMISSION_DENIED',403);
    // SALES_OS and CRM_IMPORT are not selectable by an untrusted browser.
    const source=own?(body.requested_plan==='PREMIUM'?'SELF_SERVICE_PREMIUM':'SELF_SERVICE_BASIC'):'ADMIN_INVITE';
    if(body.source!==undefined)requireValue(body.source===source,'ONBOARDING_PERMISSION_DENIED',403);
    const result=await service.create({source,request_key:body.request_key,requested_plan:body.requested_plan,
      partner_type:body.partner_type,equipment_type:body.equipment_type,existing_partner_id:body.existing_partner_id,
      prefilled_data:{...body.prefilled_data,...(own?{email:user.email}:{})}},{actorId:user.id,source});
    return{status:result.created?201:200,body:result};
  }
  const match=path.match(/^\/partner-onboarding\/([0-9a-f-]{36})(?:\/(start|data|cancel))?$/i);
  requireValue(match,'ONBOARDING_NOT_FOUND',404);
  const action=!match[2]&&method==='GET'?'READ':match[2]==='start'&&method==='POST'?'START':match[2]==='data'&&method==='PATCH'?'SAVE_DATA':match[2]==='cancel'&&method==='POST'?'CANCEL':null;
  requireValue(action,'METHOD_NOT_ALLOWED',405);
  return{status:200,body:await service.step(action,match[1],{actorId:user.id,token:action==='START'?(body.token??null):null,version:body.version,data:body.data})};
}
