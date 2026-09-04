import { array, clean, identifier, isAdmin, replaceRuntime, scopedProperties, sourcePartner, type PortalProfile, type RuntimeSnapshot } from "./runtime.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Context={service:SupabaseClient;snapshot:RuntimeSnapshot;profile:PortalProfile;sourceUserId:string|null;body:Record<string,unknown>};
const fail=(message:string,status=422)=>{throw Object.assign(new Error(message),{status})};
const collection=(snapshot:RuntimeSnapshot,key:string)=>{const rows=array(snapshot.state[key]);snapshot.state[key]=rows;return rows};

export async function writeRoute(method:string,path:string,ctx:Context){
  const {snapshot,profile,sourceUserId,service,body}=ctx,state=snapshot.state,admin=isAdmin(profile),partner=sourcePartner(state,sourceUserId);
  const allowedProperties=new Set(scopedProperties(state,profile,sourceUserId).map(x=>x.id));
  let result:unknown,action="",entityType="",entityId="";
  if(method==="POST"&&path==="/assignments"){
    if(!admin)fail("Keine Berechtigung",403); const rows=collection(snapshot,"assignments");
    const partnerId=clean(body.partnerId,100),propertyId=clean(body.propertyId,100),tradeId=clean(body.tradeId,100);
    if(!array(state.partners).some(x=>x.id===partnerId)||!array(state.properties).some(x=>x.id===propertyId)||!tradeId)fail("Partner, Objekt und Gewerk sind erforderlich");
    result={id:identifier("assignment"),partnerId,propertyId,tradeId,status:"active",overrideRegion:Boolean(body.overrideRegion),accessStart:new Date().toISOString(),accessEnd:body.accessEnd||null};rows.unshift(result as Record<string,unknown>);action="assignment.created";entityType="assignment";entityId=String((result as Record<string,unknown>).id);
  } else if(method==="POST"&&path==="/cases"){
    const propertyId=clean(body.propertyId,100);if(!allowedProperties.has(propertyId))fail("Kein Zugriff auf dieses Objekt",403);
    result={id:identifier("case"),propertyId,title:clean(body.title,180),category:clean(body.category,100),status:"new",priority:["low","medium","high"].includes(String(body.priority))?body.priority:"medium",partnerId:body.partnerId||partner?.id||null,updatedAt:new Date().toISOString(),documents:[]};if(!(result as Record<string,unknown>).title)fail("Titel ist erforderlich");collection(snapshot,"serviceCases").unshift(result as Record<string,unknown>);action="case.created";entityType="case";entityId=String((result as Record<string,unknown>).id);
  } else if(method==="POST"&&path==="/valuations"){
    if(!admin&&profile.role!=="broker_partner")fail("Keine Berechtigung",403);const propertyId=clean(body.propertyId,100);if(!allowedProperties.has(propertyId))fail("Kein Zugriff auf dieses Objekt",403);
    const value=Number(body.value);if(!Number.isFinite(value)||value<=0)fail("Gültiger Wert erforderlich");result={id:identifier("valuation"),propertyId,source:clean(body.source,100)||"Makler",value,effectiveDate:body.effectiveDate||new Date().toISOString().slice(0,10),createdBy:sourceUserId,note:clean(body.note,1000)};collection(snapshot,"valuations").unshift(result as Record<string,unknown>);action="valuation.created";entityType="valuation";entityId=String((result as Record<string,unknown>).id);
  } else if(method==="POST"&&path==="/campaigns"){
    if(profile.role!=="super_admin")fail("Keine Berechtigung",403);result={id:identifier("campaign"),title:clean(body.title,160),type:clean(body.type,80),status:"draft",source:{title:clean(body.sourceTitle,200),url:clean(body.sourceUrl,500)},regions:Array.isArray(body.regions)?body.regions:[],tradeIds:Array.isArray(body.tradeIds)?body.tradeIds:[],createdAt:new Date().toISOString(),createdBy:sourceUserId};if(!(result as Record<string,unknown>).title)fail("Titel ist erforderlich");collection(snapshot,"campaigns").unshift(result as Record<string,unknown>);action="campaign.created";entityType="campaign";entityId=String((result as Record<string,unknown>).id);
  } else if(method==="POST"&&path==="/partners"){
    if(!admin)fail("Keine Berechtigung",403);result={id:identifier("partner"),company:clean(body.company,180),contact:clean(body.contact,180),email:clean(body.email,254).toLowerCase(),status:"invited",primaryTradeId:clean(body.primaryTradeId||body.tradeId,100),tradeIds:[clean(body.primaryTradeId||body.tradeId,100)],postalCodes:Array.isArray(body.postalCodes)?body.postalCodes:[],createdAt:new Date().toISOString()};if(!(result as Record<string,unknown>).company||!(result as Record<string,unknown>).email)fail("Firma und E-Mail sind erforderlich");collection(snapshot,"partners").unshift(result as Record<string,unknown>);action="partner.created";entityType="partner";entityId=String((result as Record<string,unknown>).id);
  } else {
    const equipmentService=path.match(/^\/equipment\/([^/]+)\/service-records$/)?.[1],serviceRecordId=path.match(/^\/service-records\/([^/]+)$/)?.[1];
    const brokerFileId=path.match(/^\/broker\/sales-files\/([^/]+)$/)?.[1],brokerAction=path.match(/^\/broker\/sales-files\/([^/]+)\/(document-status|address-verification|mandate|closing|release)$/);
    const customerActionId=path.match(/^\/customer-actions\/([^/]+)\/respond$/)?.[1],opportunityId=path.match(/^\/partner-opportunities\/([^/]+)\/complete$/)?.[1];
    if(method==="POST"&&equipmentService){
      const equipment=collection(snapshot,"equipmentRecords").find(x=>String(x.id)===equipmentService);if(!equipment)fail("Equipment nicht gefunden",404);if(!allowedProperties.has(equipment.propertyId))fail("Kein Zugriff",403);if(partner&&equipment.tradeId!==partner.primaryTradeId)fail("Fremdes Gewerk",403);
      result={id:identifier("service"),equipmentId:equipment.id,propertyId:equipment.propertyId,partnerId:partner?.id||body.partnerId||null,serviceDate:body.serviceDate||new Date().toISOString().slice(0,10),serviceType:clean(body.serviceType||body.type,120),notes:clean(body.notes,2000),status:"recorded",documents:[],createdAt:new Date().toISOString(),createdBy:sourceUserId};collection(snapshot,"partnerServiceRecords").unshift(result as Record<string,unknown>);action="service_record.created";entityType="service_record";entityId=String((result as Record<string,unknown>).id);
    } else if(method==="PATCH"&&serviceRecordId){
      const row=collection(snapshot,"partnerServiceRecords").find(x=>String(x.id)===serviceRecordId);if(!row)fail("Serviceeintrag nicht gefunden",404);if(!allowedProperties.has(row.propertyId))fail("Kein Zugriff",403);for(const key of ["serviceDate","serviceType","notes","status"])if(key in body)row[key]=clean(body[key],key==="notes"?2000:160);row.updatedAt=new Date().toISOString();result=row;action="service_record.updated";entityType="service_record";entityId=serviceRecordId;
    } else if((method==="PATCH"||method==="POST")&&(brokerFileId||brokerAction)){
      if(!admin&&profile.role!=="broker_partner")fail("Keine Berechtigung",403);const id=brokerFileId||brokerAction![1],row=collection(snapshot,"salesFiles").find(x=>String(x.id)===id);if(!row)fail("Verkaufsakte nicht gefunden",404);if(!allowedProperties.has(row.propertyId))fail("Kein Zugriff",403);
      const step=brokerAction?.[2]||"update";
      if(step==="document-status"){const statuses=typeof row.documentStatuses==="object"&&row.documentStatuses?row.documentStatuses as Record<string,unknown>:{};const documentType=clean(body.documentType,120),status=clean(body.status,80);if(!documentType||!["external_requested","customer_requested","unavailable","not_required","available"].includes(status))fail("Dokumenttyp oder Status ungültig");statuses[documentType]={status,note:clean(body.note,500),updatedAt:new Date().toISOString(),updatedBy:sourceUserId};row.documentStatuses=statuses;}
      else if(step==="address-verification"){row.addressVerification={verified:Boolean(body.verified??body.addressConfirmed),note:clean(body.note,500),updatedAt:new Date().toISOString(),updatedBy:sourceUserId};}
      else if(step==="mandate"){const mandate={id:identifier("mandate"),salesFileId:id,propertyId:row.propertyId,partnerId:partner?.id||body.partnerId||row.partnerId||null,commissionModel:clean(body.commissionModel,80),commissionPercent:Number(body.commissionPercent||0),contractStart:body.contractStart||null,contractEnd:body.contractEnd||null,transmittedAt:new Date().toISOString(),status:"transmitted"};collection(snapshot,"brokerMandates").unshift(mandate);row.mandateId=mandate.id;result=mandate;}
      else if(step==="closing"){const closing={id:identifier("closing"),salesFileId:id,propertyId:row.propertyId,partnerId:partner?.id||row.partnerId||null,notarizationDate:body.notarizationDate||null,salePrice:Number(body.salePrice||row.askingPrice||0),recordedAt:new Date().toISOString()};if(!closing.notarizationDate)fail("Beurkundungsdatum ist erforderlich");collection(snapshot,"brokerClosings").unshift(closing);row.status="completed";result=closing;}
      else if(step==="release"){const required=["propertyId","calculatedValue"];if(required.some(k=>!row[k])||Number(row.completeness||0)<100)fail("Verkaufsakte ist noch nicht vollständig");row.status="ready";row.releasedAt=new Date().toISOString();row.locked=true;}
      else {const protectedKeys=new Set(["id","propertyId","partnerId"]);for(const [k,v] of Object.entries(body))if(!protectedKeys.has(k))row[k]=typeof v==="string"?clean(v,2000):v;row.updatedAt=new Date().toISOString();}
      result=result||row;action=`broker.sales_file.${step}`;entityType="sales_file";entityId=id;
    } else if(method==="POST"&&customerActionId){
      const row=collection(snapshot,"customerActions").find(x=>String(x.id)===customerActionId);if(!row)fail("Kundenaktion nicht gefunden",404);if(!allowedProperties.has(row.propertyId))fail("Kein Zugriff",403);row.response=clean(body.response,80);row.respondedAt=new Date().toISOString();row.status="responded";result=row;action="customer_action.responded";entityType="customer_action";entityId=customerActionId;
    } else if(method==="POST"&&opportunityId){
      const row=collection(snapshot,"partnerOpportunities").find(x=>String(x.id)===opportunityId);if(!row)fail("Opportunity nicht gefunden",404);if(!admin&&row.partnerId!==partner?.id)fail("Kein Zugriff",403);row.status="completed";row.completedAt=new Date().toISOString();row.completionNote=clean(body.note,1000);result=row;action="opportunity.completed";entityType="partner_opportunity";entityId=opportunityId;
    } else {
    const caseId=path.match(/^\/cases\/([^/]+)$/)?.[1],partnerId=path.match(/^\/partners\/([^/]+)$/)?.[1],equipmentId=path.match(/^\/equipment\/([^/]+)$/)?.[1];
    const key=caseId?"serviceCases":partnerId?"partners":equipmentId?"equipmentRecords":"",id=caseId||partnerId||equipmentId;
    if(!key||!id)return undefined;const rows=collection(snapshot,key),row=rows.find(x=>String(x.id)===id);if(!row)fail("Datensatz nicht gefunden",404);
    if(partnerId&&!admin)fail("Keine Berechtigung",403);if((caseId||equipmentId)&&!allowedProperties.has(row.propertyId))fail("Kein Zugriff",403);
    if(method==="DELETE"){if(profile.role!=="super_admin")fail("Keine Berechtigung",403);snapshot.state[key]=rows.filter(x=>x!==row);result={deleted:true,id};action=`${entityType||key}.deleted`;}
    else if(method==="PATCH"){const protectedKeys=new Set(["id","userId","propertyId","password","passwordHash"]);for(const [k,v] of Object.entries(body))if(!protectedKeys.has(k))row[k]=typeof v==="string"?clean(v,2000):v;row.updatedAt=new Date().toISOString();result=row;action=`${key}.updated`;}
    else return undefined;entityType=key;entityId=id;
    }
  }
  await replaceRuntime(service,snapshot,profile.id,action,entityType,entityId,{sourceUserId});
  return {status:method==="POST"?201:200,body:result};
}
