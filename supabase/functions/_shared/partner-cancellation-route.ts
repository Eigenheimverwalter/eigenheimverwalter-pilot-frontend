import {loadRuntime,sourcePartner} from './runtime.ts';
import {assertCancellationActor,cancellationTerms,assertCancellationConfirmation} from './partner-cancellation.mjs';
import {stripeClient,TEST_STRIPE_ACCOUNT} from './partner-stripe.mjs';

export async function syncCancellationBilling(db:any,row:any){
  if(!['PENDING','WAITING_NEXT_PERIOD'].includes(row.billing_status))return row;
  if(row.payment_mode!=='test'||!row.subscription_id?.startsWith('sub_')||!row.onboarding_id){
    const {error}=await db.from('partner_cancellations').update({billing_status:'MANUAL_REVIEW'}).eq('id',row.id);if(error)throw error;return {...row,billing_status:'MANUAL_REVIEW'};
  }
  const stripe=stripeClient(Deno.env.get('PILOT_STRIPE_SECRET_KEY')?.trim());
  const [account,subscription]=await Promise.all([stripe('account'),stripe(`subscriptions/${row.subscription_id}`)]);
  if(account.id!==TEST_STRIPE_ACCOUNT||subscription.livemode!==false||subscription.metadata?.application!=='eigenheimverwalter-pilot'||subscription.metadata?.onboarding_id!==row.onboarding_id)throw new Error('BILLING_OWNERSHIP_UNVERIFIED');
  let status='SCHEDULED';
  if(subscription.status!=='canceled'){
    const periods=subscription.items?.data?.map((item:any)=>item.current_period_end)||[];
    if(!periods.length||periods.some((p:number)=>!Number.isSafeInteger(p)||p!==periods[0]))throw new Error('BILLING_PERIOD_UNVERIFIED');
    const periodDate=new Date(periods[0]*1000).toISOString().slice(0,10);
    if(periodDate<row.effective_date)status='WAITING_NEXT_PERIOD';
    else if(periodDate!==row.effective_date)throw new Error('BILLING_DATE_REVIEW_REQUIRED');
    else if(!subscription.cancel_at_period_end){
      const changed=await stripe(`subscriptions/${row.subscription_id}`,{method:'POST',key:`pilot-cancel-${row.id}`,body:{cancel_at_period_end:'true',proration_behavior:'none'}});
      if(changed.cancel_at_period_end!==true)throw new Error('BILLING_NOT_CONFIRMED');
    }
  }
  const {error}=await db.from('partner_cancellations').update({billing_status:status,billing_checked_at:new Date().toISOString()}).eq('id',row.id);if(error)throw error;
  return {...row,billing_status:status};
}
const publicRow=(row:any)=>row?{id:row.id,requestedAt:row.requested_at,effectiveDate:row.effective_date,status:row.status,billingStatus:row.billing_status,deletionStatus:row.deletion_status}:null;
export async function partnerCancellationRoute(req:Request,db:any,profile:any,actor:any,sourceId:string|null){
  const snapshot=await loadRuntime(db),partner=sourcePartner(snapshot.state,sourceId);
  assertCancellationActor(profile,partner,Boolean(req.headers.get('x-ehv-support-user')));
  const {data:existing,error}=await db.from('partner_cancellations').select('*').eq('partner_id',partner!.id).maybeSingle();if(error)throw new Error('Kündigungsstand konnte nicht geladen werden.');
  if(req.method==='GET')return {partner:true,terms:existing?null:cancellationTerms(partner),cancellation:publicRow(existing)};
  if(req.method!=='POST')throw Object.assign(new Error('Methode nicht erlaubt'),{status:405});
  if(existing)return {cancellation:publicRow(existing),alreadyReceived:true};
  const text=await req.text();if(text.length>4096)throw Object.assign(new Error('Anfrage zu groß'),{status:413});
  let body;try{body=JSON.parse(text)}catch{throw Object.assign(new Error('Ungültige Anfrage'),{status:400})}
  const terms=cancellationTerms(partner);assertCancellationConfirmation(body,terms);
  const {data:record,error:saveError}=await db.rpc('request_partner_cancellation',{p_actor:actor.id,p_revision:snapshot.revision,p_partner:partner!.id,p_date:terms.effectiveDate,p_plan:terms.plan,p_notice:terms.notice});
  if(saveError)throw Object.assign(new Error(saveError.message.includes('CHECKOUT_RECONCILIATION_REQUIRED')?'Ein offener Zahlungsvorgang muss zuerst abgeschlossen oder im Upgrade-Formular beendet werden. Danach können Sie kündigen.':'Kündigung konnte nicht gespeichert werden. Bitte neu laden und erneut versuchen.'),{status:409});
  const row=Array.isArray(record)?record[0]:record;
  // The accepted notice is durable before contacting Stripe; an outage must
  // never erase the receipt time or force the partner to miss a deadline.
  let synced=row;try{synced=await syncCancellationBilling(db,row)}catch{/* durable worker retries; do not report billing as complete */}
  return {cancellation:publicRow(synced),received:true};
}
