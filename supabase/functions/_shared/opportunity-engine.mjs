const daysBetween=(a,b)=>Math.max(0,(new Date(b)-new Date(a))/86400000);
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const ruleValue=(rule,context)=>{
  const actual=rule.path.split('.').reduce((value,key)=>value?.[key],context);
  if(rule.operator==='gte')return Number(actual)>=Number(rule.value);
  if(rule.operator==='lte')return Number(actual)<=Number(rule.value);
  if(rule.operator==='gt')return Number(actual)>Number(rule.value);
  if(rule.operator==='lt')return Number(actual)<Number(rule.value);
  if(rule.operator==='eq')return actual===rule.value;
  if(rule.operator==='missing')return actual===null||actual===undefined||actual==='';
  if(rule.operator==='within_days')return actual&&daysBetween(actual,context.now)<=Number(rule.value);
  return false;
};

export function calculateRelevance(definition,context){
  const breakdown=[];
  for(const rule of definition.scoreRules||[])if(ruleValue(rule,context))breakdown.push({code:rule.code,label:rule.label,points:Number(rule.points),evidence:rule.path});
  const scoreTotal=clamp(breakdown.reduce((sum,item)=>sum+item.points,0));
  return {scoreTotal,breakdown,decision:scoreTotal>=definition.minimumRelevanceScore?'relevant':'rejected'};
}

export function suppressionReason(definition,event,property,state,now=new Date().toISOString()){
  const previous=(state.customerActions||[]).filter(x=>x.propertyId===property.id&&x.triggerDefinitionId===definition.id);
  if(previous.some(x=>x.triggerEventId===event.id))return'duplicate_event';
  if(previous.some(x=>['dismissed','opted_out'].includes(x.status)))return'customer_preference';
  const recent=previous.find(x=>daysBetween(x.createdAt,now)<definition.cooldownDays);
  if(recent)return'cooldown';
  const since=new Date(new Date(now)-Number(definition.contactPeriodDays||30)*86400000);
  if(previous.filter(x=>new Date(x.createdAt)>=since&&['sent','opened','responded'].includes(x.status)).length>=definition.maxCustomerContactsPerPeriod)return'contact_limit';
  if((state.serviceCases||[]).some(x=>x.propertyId===property.id&&x.category===definition.partnerActionType&&x.status!=='done'))return'active_similar_ticket';
  return null;
}

export function processTriggerEvent({definition,event,state,getHealth,id,now=new Date().toISOString()}){
  if(event.processingStatus==='processed')return {idempotent:true,event,affected:[],opportunities:[]};
  event.processingStatus='processing';event.processingStartedAt=now;
  const affected=[],relevant=[];
  for(const property of state.properties){
    if(event.postalCodes.length&&!event.postalCodes.includes(property.postalCode))continue;
    const equipment=state.equipmentRecords.filter(x=>x.propertyId===property.id&&definition.relevantEquipmentTypes.includes(x.tradeId));
    if(definition.requiredPropertyConditions.requiresEquipment&&!equipment.length)continue;
    const primary=equipment[0]||null,health=primary?getHealth(primary):null,context={now,event,property,equipment:primary,health,computed:{locationMatched:true,equipmentAge:primary?.year?new Date(now).getFullYear()-Number(primary.year):null}};
    const scored=calculateRelevance(definition,context),suppression=suppressionReason(definition,event,property,state,now),decision=suppression?'suppressed':scored.decision;
    const row={id:id('ap'),triggerEventId:event.id,triggerDefinitionId:definition.id,propertyId:property.id,relevantEquipmentId:primary?.id||null,relevantTrade:definition.relevantTrades[0],scoreTotal:scored.scoreTotal,scoreBreakdown:scored.breakdown,decision,suppressionReason:suppression,createdAt:now};
    state.affectedProperties.push(row);affected.push(row);if(decision==='relevant')relevant.push({row,property});
  }
  const grouped=new Map();
  for(const candidate of relevant){
    const trade=candidate.row.relevantTrade,property=candidate.property,propertyState=state.postalDirectory.find(x=>x.postalCode===property.postalCode)?.state;
    const partners=state.partners.filter(p=>p.status==='active'&&p.primaryTradeId===trade).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
    const partner=partners.find(p=>p.postalCodes.includes(property.postalCode))||partners.find(p=>p.postalCodes.some(code=>state.postalDirectory.find(x=>x.postalCode===code)?.state===propertyState));
    if(!partner){candidate.row.decision='unmatched';continue}
    const key=partner.id,group=grouped.get(key)||{partner,candidates:[]};group.candidates.push(candidate);grouped.set(key,group);
  }
  const opportunities=[];
  for(const {partner,candidates} of grouped.values()){
    const opportunity={id:id('opp'),triggerEventId:event.id,triggerDefinitionId:definition.id,partnerId:partner.id,tradeId:definition.relevantTrades[0],status:'proposed',affectedPropertyIds:candidates.map(x=>x.property.id),propertyCount:candidates.length,highPriorityCount:candidates.filter(x=>x.row.scoreTotal>=80).length,scoreDistribution:{high:candidates.filter(x=>x.row.scoreTotal>=80).length,medium:candidates.filter(x=>x.row.scoreTotal>=60&&x.row.scoreTotal<80).length},createdAt:now};
    state.partnerOpportunities.push(opportunity);opportunities.push(opportunity);
    for(const candidate of candidates){const action={id:id('ca'),triggerDefinitionId:definition.id,triggerEventId:event.id,affectedPropertyId:candidate.row.id,propertyId:candidate.property.id,customerId:candidate.property.customerId,partnerOpportunityId:opportunity.id,templateId:definition.customerActionTemplateId,status:'proposed',response:null,createdAt:now};state.customerActions.push(action)}
  }
  event.processingStatus='processed';event.processedAt=now;event.result={affected:affected.length,relevant:relevant.length,opportunities:opportunities.length};
  state.opportunityEvents.push({id:id('oe'),triggerEventId:event.id,type:'trigger.processed',status:'completed',at:now,counts:event.result});
  return {idempotent:false,event,affected,opportunities};
}
