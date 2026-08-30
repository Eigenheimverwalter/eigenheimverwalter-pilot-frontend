export const SERVICE_STATUSES=Object.freeze(['new','offered','accepted','contacted','appointment','in_progress','offer_created','commissioned','performed','documentation_open','completed','rejected','cancelled']);
const LEGACY_STATUS={waiting:'contacted',done:'completed'};
const TRANSITIONS=Object.freeze({new:['offered','accepted','rejected','cancelled'],offered:['accepted','rejected','cancelled'],accepted:['contacted','appointment','in_progress','cancelled'],contacted:['appointment','in_progress','cancelled'],appointment:['in_progress','cancelled'],in_progress:['offer_created','commissioned','performed','cancelled'],offer_created:['commissioned','performed','cancelled'],commissioned:['performed','cancelled'],performed:['documentation_open','completed'],documentation_open:['completed'],completed:[],rejected:[],cancelled:[]});
export const normalizeServiceStatus=status=>LEGACY_STATUS[status]||status||'new';
export const allowedServiceTransitions=status=>TRANSITIONS[normalizeServiceStatus(status)]||[];
export function transitionServiceProcess(process,next,{reason='',hasEvidence=false,acknowledgeMissingEvidence=false,actorId=null,now=new Date()}={}){
  const current=normalizeServiceStatus(process.status),target=normalizeServiceStatus(next);
  if(!SERVICE_STATUSES.includes(target))return {ok:false,error:'unknown_status'};
  if(!allowedServiceTransitions(current).includes(target))return {ok:false,error:'invalid_transition',allowed:allowedServiceTransitions(current)};
  if(target==='rejected'&&!String(reason).trim())return {ok:false,error:'rejection_reason_required'};
  if(target==='completed'&&!hasEvidence&&!acknowledgeMissingEvidence)return {ok:false,error:'completion_evidence_required'};
  const at=now.toISOString();process.status=target;process.updatedAt=at;process.statusEvents||=[];process.statusEvents.push({from:current,to:target,at,by:actorId,reason:String(reason||'').trim()||null,missingEvidenceAcknowledged:target==='completed'&&!hasEvidence&&acknowledgeMissingEvidence});
  return {ok:true,process,event:process.statusEvents.at(-1)};
}
export function serviceSla(process,{now=new Date(),firstReactionHours=4,completionHours=168}={}){
  const start=new Date(process.createdAt||process.updatedAt||now),first=(process.statusEvents||[]).find(x=>x.to!=='new'),completed=(process.statusEvents||[]).find(x=>x.to==='completed'),hours=date=>Math.max(0,Math.round((new Date(date)-start)/36e3)/100);
  return {firstReactionHours:first?hours(first.at):null,firstReactionTargetHours:firstReactionHours,firstReactionBreached:first?hours(first.at)>firstReactionHours:(now-start)/36e5>firstReactionHours,completionHours:completed?hours(completed.at):null,completionTargetHours:completionHours,completionBreached:completed?hours(completed.at)>completionHours:(now-start)/36e5>completionHours};
}
