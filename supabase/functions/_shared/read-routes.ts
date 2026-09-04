import { array, isAdmin, publicRuntimeUser, scopedProperties, sourcePartner, type PortalProfile, type RuntimeState } from "./runtime.ts";

const forbidden=()=>({status:403,body:{error:"Keine Berechtigung"}});
const ok=(body:unknown)=>({status:200,body});

export function readRoute(path:string,state:RuntimeState,profile:PortalProfile,sourceUserId:string|null,email:string|null){
  const admin=isAdmin(profile), partner=sourcePartner(state,sourceUserId), properties=scopedProperties(state,profile,sourceUserId);
  const propertyIds=new Set(properties.map(x=>x.id));
  const scoped=(key:string)=>array(state[key]).filter(x=>!x.propertyId||propertyIds.has(x.propertyId));
  if(path==="/account")return ok({account:{id:profile.id,name:profile.display_name,email,role:profile.role,createdAt:profile.created_at},partner});
  if(path==="/customers")return admin?ok({customers:array(state.customers),properties,source:"supabase"}):forbidden();
  if(path==="/production/customers")return admin?ok({customers:array(state.customers),counts:{visible:array(state.customers).length,hidden:array(state.productionCustomerDeletions).length},sort:"registeredAt:desc",registrationSummary:{},sourceUserCount:array(state.users).length,hiddenCount:array(state.productionCustomerDeletions).length,importedAt:(state.meta as Record<string,unknown>)?.createdAt||null,pendingSourceSync:false}):forbidden();
  if(path==="/partners")return admin?ok({partners:array(state.partners),trades:array(state.trades),organizations:array(state.partnerOrganizations),roleTemplates:array(state.partnerRoleTemplates),licensePolicy:{includedPostalCodes:2},source:"supabase"}):forbidden();
  if(path==="/assignments")return admin?ok({assignments:array(state.assignments),partners:array(state.partners),properties:array(state.properties),trades:array(state.trades)}):forbidden();
  if(path==="/cases")return ok({cases:scoped("serviceCases"),serviceRecords:scoped("partnerServiceRecords"),equipment:scoped("equipmentRecords"),customers:admin?array(state.customers):[],properties});
  if(path==="/sales")return ok({salesFiles:scoped("salesFiles"),valuations:scoped("valuations"),properties});
  if(path==="/campaigns")return admin?ok({campaigns:array(state.campaigns),trades:array(state.trades),regions:[],types:["weather","regulation","funding","manufacturer","maintenance"]}):forbidden();
  if(path==="/role-profiles")return profile.role==="super_admin"?ok({roles:array(state.roleProfiles),trades:array(state.trades),plans:["standard","premium"],organizations:array(state.partnerOrganizations),accounts:array(state.users).map(publicRuntimeUser),permissionCatalog:[]}):forbidden();
  if(path==="/partner-role-templates")return admin?ok({roles:array(state.partnerRoleTemplates),trades:array(state.trades),permissionCatalog:[]}):forbidden();
  if(path==="/admin/users")return profile.role==="super_admin"?ok({users:array(state.users).map(publicRuntimeUser),partners:array(state.partners)}):forbidden();
  if(path==="/opportunity-engine")return ok({scope:admin?"admin":"partner",definitions:array(state.triggerDefinitions),events:array(state.triggerEvents),affectedProperties:scoped("affectedProperties"),opportunities:admin?array(state.partnerOpportunities):array(state.partnerOpportunities).filter(x=>x.partnerId===partner?.id),customerActions:scoped("customerActions"),templates:array(state.customerActionTemplates),partners:admin?array(state.partners):partner?[partner]:[],kpis:{},categories:[],queue:array(state.opportunityJobs)});
  if(path==="/partner/workbench")return partner?ok({partner,properties,equipment:scoped("equipmentRecords"),serviceRecords:scoped("partnerServiceRecords"),cases:scoped("serviceCases"),offers:array(state.partnerOffers).filter(x=>x.partnerId===partner.id),trades:array(state.trades)}):forbidden();
  if(path==="/audit")return admin?ok({audit:array(state.audit).map(x=>({...x,detail:undefined}))}):forbidden();
  if(path==="/postal-codes")return ok({postalCodes:array(state.postalDirectory),trades:array(state.trades)});
  if(path==="/portfolio/risks")return admin?ok(array(state.properties).map(property=>({property,score:0,reasons:[]}))):forbidden();
  return undefined;
}
