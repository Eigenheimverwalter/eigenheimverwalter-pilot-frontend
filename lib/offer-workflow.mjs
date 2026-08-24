export function acceptPartnerOffer(data,{offerId,customerId,now=new Date().toISOString(),id=prefix=>`${prefix}-${Date.now()}`}){
  const offer=data.partnerOffers.find(item=>item.id===offerId);
  if(!offer)return {error:'not_found'};
  const property=data.properties.find(item=>item.id===offer.propertyId);
  if(!property||String(property.customerId)!==String(customerId))return {error:'customer_mismatch'};
  if(offer.status==='accepted')return {idempotent:true,offer,email:null};
  if(offer.status!=='submitted')return {error:'invalid_status'};
  const partner=data.partners.find(item=>item.id===offer.partnerId&&item.status==='active');
  if(!partner?.email)return {error:'partner_unavailable'};
  offer.status='accepted';offer.acceptedAt=now;offer.acceptedByCustomerId=customerId;
  const email={id:id('mail'),to:partner.email,partnerId:partner.id,customerId,offerId:offer.id,propertyId:property.id,template:'offer_binding_accepted',subject:'Ihr Angebot wurde verbindlich angenommen',status:'queued',createdAt:now};
  data.emailOutbox.unshift(email);
  data.notifications.unshift({id:id('n'),userId:partner.userId||partner.id,type:'offer.accepted',title:'Angebot verbindlich angenommen',message:`Das Angebot ${offer.name} wurde vom Kunden verbindlich zugesagt.`,offerId:offer.id,propertyId:property.id,createdAt:now,status:'queued'});
  return {idempotent:false,offer,email};
}
