const allowedPriorities=new Set(['low','medium','high','urgent']);
const terminalStatuses=new Set(['completed','cancelled']);
const required=(value,name)=>{if(value===null||value===undefined||String(value).trim()==='')throw Object.assign(new Error(`${name} ist erforderlich`),{status:422,code:'VALIDATION_ERROR'})};
const clean=(value,length=500)=>String(value??'').replace(/[<>\u0000-\u001f]/g,' ').trim().slice(0,length);
const same=(a,b)=>String(a)===String(b);

export function selectRoutingPartner(state,{tradeId,postalCode,excludedPartnerIds=[]}){
  const excluded=new Set(excludedPartnerIds.map(String));
  return (state.partners||[]).filter(partner=>{
    const trades=Array.isArray(partner.tradeIds)?partner.tradeIds:[partner.primaryTradeId];
    const licensed=Array.isArray(partner.postalCodes)&&partner.postalCodes.map(String).includes(String(postalCode));
    const licenseActive=!partner.license||!['expired','suspended','cancelled'].includes(String(partner.license.status));
    return partner.status==='active'&&licenseActive&&trades.map(String).includes(String(tradeId))&&licensed&&!excluded.has(String(partner.id));
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0]||null;
}

export function createServiceRequest(state,input,{id,now=new Date().toISOString()}={}){
  for(const [value,name] of [[input.customerId,'customer_id'],[input.propertyId,'property_id'],[input.tradeId,'trade_id'],[input.postalCode,'postal_code']])required(value,name);
  if(!/^\d{5}$/.test(String(input.postalCode)))throw Object.assign(new Error('postal_code muss fünfstellig sein'),{status:422,code:'VALIDATION_ERROR'});
  if(input.source==='setcard')required(input.triggerId,'trigger_id');
  if(input.customerConfirmed!==true)throw Object.assign(new Error('Eine ausdrückliche Kundenbestätigung ist erforderlich'),{status:403,code:'CUSTOMER_CONFIRMATION_REQUIRED'});
  const duplicate=(state.serviceRequests||[]).find(row=>input.idempotencyKey&&row.idempotencyKey===input.idempotencyKey);
  if(duplicate)return{request:duplicate,idempotent:true};
  const partner=selectRoutingPartner(state,input);
  const request={id:id||crypto.randomUUID(),customerId:String(input.customerId),propertyId:String(input.propertyId),equipmentId:input.equipmentId?String(input.equipmentId):null,triggerId:input.triggerId?String(input.triggerId):null,source:['setcard','equipment','admin'].includes(input.source)?input.source:'equipment',tradeId:String(input.tradeId),postalCode:String(input.postalCode),serviceType:clean(input.serviceType,100),priority:allowedPriorities.has(input.priority)?input.priority:'medium',description:clean(input.description,1000),idempotencyKey:clean(input.idempotencyKey,160)||null,status:partner?'offered':'routing_open',assignedPartnerId:partner?String(partner.id):null,offeredAt:partner?now:null,acceptedAt:null,contactReleasedAt:null,appointmentAt:null,completedAt:null,createdAt:now,updatedAt:now,routingHistory:partner?[{partnerId:String(partner.id),action:'offered',at:now}]:[],version:1};
  (state.serviceRequests??=[]).unshift(request);return{request,idempotent:false};
}

export function actOnServiceRequest(state,requestId,action,input,{partnerId,now=new Date().toISOString()}={}){
  const request=(state.serviceRequests||[]).find(row=>same(row.id,requestId));if(!request)throw Object.assign(new Error('Serviceanfrage nicht gefunden'),{status:404,code:'NOT_FOUND'});
  if(terminalStatuses.has(request.status))throw Object.assign(new Error('Serviceanfrage ist abgeschlossen'),{status:409,code:'TERMINAL_STATE'});
  if(['accept','reject','appointment','complete'].includes(action)&&!same(request.assignedPartnerId,partnerId))throw Object.assign(new Error('Keine Berechtigung für diese Serviceanfrage'),{status:403,code:'FORBIDDEN'});
  if(action==='accept'){if(request.status!=='offered')throw Object.assign(new Error('Serviceanfrage ist nicht zur Annahme angeboten'),{status:409,code:'INVALID_TRANSITION'});request.status='accepted';request.acceptedAt=now;request.contactReleasedAt=now;}
  else if(action==='reject'){if(request.status!=='offered')throw Object.assign(new Error('Serviceanfrage ist nicht zur Ablehnung angeboten'),{status:409,code:'INVALID_TRANSITION'});required(input.reason,'reason');request.routingHistory.push({partnerId:String(partnerId),action:'rejected',reason:clean(input.reason,500),at:now});const next=selectRoutingPartner(state,{tradeId:request.tradeId,postalCode:request.postalCode,excludedPartnerIds:request.routingHistory.map(x=>x.partnerId)});request.assignedPartnerId=next?String(next.id):null;request.status=next?'offered':'routing_open';request.offeredAt=next?now:null;if(next)request.routingHistory.push({partnerId:String(next.id),action:'offered',at:now});}
  else if(action==='appointment'){if(!['accepted','appointment'].includes(request.status))throw Object.assign(new Error('Termin ist erst nach Annahme möglich'),{status:409,code:'INVALID_TRANSITION'});required(input.appointmentAt,'appointment_at');request.status='appointment';request.appointmentAt=String(input.appointmentAt);}
  else if(action==='complete'){if(!['accepted','appointment','in_progress'].includes(request.status))throw Object.assign(new Error('Unzulässiger Abschlussstatus'),{status:409,code:'INVALID_TRANSITION'});required(input.serviceRecord,'service_record');request.status='completed';request.completedAt=now;const mutation={id:crypto.randomUUID(),kind:'service_record.create',status:'pending',requestId:request.id,propertyId:request.propertyId,equipmentId:request.equipmentId,partnerId:String(partnerId),payload:input.serviceRecord,createdAt:now,attempts:0};(state.coreMutationOutbox??=[]).push(mutation);request.coreMutationId=mutation.id;}
  else throw Object.assign(new Error('Unbekannte Prozessaktion'),{status:422,code:'UNKNOWN_ACTION'});
  request.updatedAt=now;request.version=Number(request.version||0)+1;return request;
}

export function expireStaleOffers(state,{now=new Date().toISOString(),offerTimeoutMinutes=1440}={}){
  const timeout=Math.max(1,Number(offerTimeoutMinutes)||1440)*60*1000,nowMs=Date.parse(now);
  const rerouted=[];
  for(const request of state.serviceRequests||[]){
    if(request.status!=='offered'||!request.offeredAt||nowMs-Date.parse(request.offeredAt)<timeout)continue;
    request.routingHistory.push({partnerId:String(request.assignedPartnerId),action:'expired',at:now});
    const next=selectRoutingPartner(state,{tradeId:request.tradeId,postalCode:request.postalCode,excludedPartnerIds:request.routingHistory.map(item=>item.partnerId)});
    request.assignedPartnerId=next?String(next.id):null;
    request.status=next?'offered':'routing_open';
    request.offeredAt=next?now:null;
    request.updatedAt=now;
    request.version=Number(request.version||0)+1;
    if(next)request.routingHistory.push({partnerId:String(next.id),action:'offered',at:now});
    rerouted.push(request.id);
  }
  return rerouted;
}

export function serviceRequestView(state,request,{viewerPartnerId=null,admin=false}={}){
  const property=(state.properties||[]).find(row=>same(row.id,request.propertyId))||{},customer=(state.customers||[]).find(row=>same(row.id,request.customerId))||{};
  const released=admin||(viewerPartnerId&&same(viewerPartnerId,request.assignedPartnerId)&&Boolean(request.contactReleasedAt));
  return{...request,offer:{requestId:request.id,tradeId:request.tradeId,serviceType:request.serviceType,postalCode:request.postalCode,propertyType:property.type||property.property_type||null,equipmentId:request.equipmentId,priority:request.priority,description:request.description},customer:released?{id:customer.id,name:customer.name||[customer.first_name,customer.last_name].filter(Boolean).join(' '),email:customer.email,phone:customer.phone||customer.phone_number}:undefined,property:released?{id:property.id,address:property.address||property.street_name,houseNumber:property.house_number,postalCode:property.postalCode||property.postal_code||property.zip_code,city:property.city}:undefined,contactReleased:released};
}
