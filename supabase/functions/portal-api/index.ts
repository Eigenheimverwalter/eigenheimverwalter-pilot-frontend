import { corsHeaders } from "../_shared/cors.ts";
import {
  array, authenticate, isAdmin, loadRuntime, replaceRuntime, scopedProperties, sourcePartner,
  type PortalProfile,
} from "../_shared/runtime.ts";
import { readRoute } from "../_shared/read-routes.ts";
import { writeRoute } from "../_shared/write-routes.ts";
import { DwdWarningProvider } from "../_shared/weather-providers.mjs";

const jsonResponse = (req:Request,body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const projectRef = "rpniwtshbwjuesoeztyt";

const dashboard = (state: Record<string, unknown>, profile: PortalProfile, sourceUserId: string | null) => {
  const properties = scopedProperties(state, profile, sourceUserId);
  const partner = sourcePartner(state, sourceUserId);
  const partners = isAdmin(profile) ? array(state.partners) : partner ? [partner] : [];
  const propertyIds = new Set(properties.map((item) => item.id));
  const services = array(state.serviceCases).filter((item) => propertyIds.has(item.propertyId));
  const salesFiles = array(state.salesFiles).filter((item) => propertyIds.has(item.propertyId));
  return {
    kpis: {
      partners: partners.filter((item) => item.status === "active").length,
      properties: properties.length,
      openCases: services.filter((item) => !["done", "cancelled"].includes(String(item.status))).length,
      salesFiles: salesFiles.length,
    },
    recentCases: services.slice(0, 5),
    properties,
    source: "supabase",
  };
};

Deno.serve(async (req) => {
  const json=(body:unknown,status=200)=>jsonResponse(req,body,status);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ service: "ehv-pilot-portal-api", projectRef, status: "ok", version: "0.1.0" });
  }

  let auth;
  try { auth = await authenticate(req.headers.get("Authorization")); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Nicht angemeldet" }, Number((error as {status?:number}).status || 401)); }
  const { user, profile, sourceUserId, service: serviceClient } = auth;
  if(sourceUserId&&profile.role==="partner_basic"&&user.email_confirmed_at){
    try{const activationSnapshot=await loadRuntime(serviceClient),partner=sourcePartner(activationSnapshot.state,sourceUserId);if(partner&&partner.status==="invited"){partner.status="active";partner.lifecycle="active";partner.activatedAt=new Date().toISOString();await replaceRuntime(serviceClient,activationSnapshot,profile.id,"partner_basic.email_confirmed","partner",String(partner.id),{sourceUserId});}}
    catch(error){if(!String(error instanceof Error?error.message:error).includes("parallel geändert"))return json({error:"Die bestätigte Partnerregistrierung konnte nicht aktiviert werden"},503);}
  }
  const routePath=url.pathname.replace(/^.*\/portal-api/,"")||"/";
  if(req.method==="GET"&&routePath==="/support-view/users"){
    if(!isAdmin(profile))return json({error:"Keine Berechtigung"},403);
    const {data:profiles,error}=await serviceClient.from("portal_users").select("id,display_name,role,status").eq("status","active").in("role",["crafts_partner","broker_partner","partner_basic"]);if(error)return json({error:"Partnerzugänge konnten nicht geladen werden"},503);
    return json({users:(profiles||[]).map(item=>({id:item.id,name:item.display_name,role:item.role})),mode:"read_only",notice:"Support-Sicht übernimmt ausschließlich die effektiven Leserechte. Änderungen sind gesperrt."});
  }
  if(req.method==="POST"&&routePath==="/support-view/start"){
    if(!isAdmin(profile))return json({error:"Keine Berechtigung"},403);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    let targetId=String(body.userId||"");
    if(body.partnerId){
      const snapshot=await loadRuntime(serviceClient),selected=array(snapshot.state.partners).find(item=>String(item.id)===String(body.partnerId));
      if(!selected||selected.status!=="active"||!selected.userId)return json({error:"Für diesen Partner ist kein aktiver Portalzugang verknüpft"},422);
      const {data:identity,error:identityError}=await serviceClient.from("identity_imports").select("auth_user_id").eq("source_user_id",String(selected.userId)).maybeSingle();
      if(identityError||!identity?.auth_user_id)return json({error:"Der verknüpfte Partnerzugang konnte nicht aufgelöst werden"},422);
      targetId=String(identity.auth_user_id);
    }
    const {data:target}=await serviceClient.from("portal_users").select("id,display_name,role,status").eq("id",targetId).eq("status","active").maybeSingle();
    if(!target||!["crafts_partner","broker_partner","partner_basic"].includes(target.role))return json({error:"Bitte einen aktiven Partnerzugang auswählen"},422);
    await serviceClient.from("audit_events").insert({actor_user_id:profile.id,action:"support_view.started",entity_type:"portal_user",entity_id:target.id,metadata:{partnerId:body.partnerId||null,targetRole:target.role,readOnly:true}});
    return json({user:{id:target.id,name:target.display_name,role:target.role},csrf:null,supportView:{actor:{id:profile.id,name:profile.display_name,role:profile.role},target:{id:target.id,name:target.display_name,role:target.role},readOnly:true}});
  }
  if(req.method==="POST"&&routePath==="/support-view/stop"){await serviceClient.from("audit_events").insert({actor_user_id:profile.id,action:"support_view.stopped",entity_type:"portal_user",entity_id:profile.id,metadata:{readOnly:true}});return json({user:{id:profile.id,name:profile.display_name,email:user.email,role:profile.role},csrf:null,supportView:null});}
  let effectiveProfile=profile,effectiveSourceUserId=sourceUserId,effectiveEmail=user.email||null,supportView:null|Record<string,unknown>=null;
  const supportTarget=req.headers.get("x-ehv-support-user");
  if(supportTarget){if(!isAdmin(profile))return json({error:"Keine Berechtigung"},403);if(req.method!=="GET")return json({error:"Support-Sicht ist ausschließlich lesend"},403);const {data:target}=await serviceClient.from("portal_users").select("id,display_name,role,status,created_at").eq("id",supportTarget).eq("status","active").maybeSingle();if(!target)return json({error:"Support-Ziel ist nicht mehr verfügbar"},410);const {data:identity}=await serviceClient.from("identity_imports").select("source_user_id,email").eq("auth_user_id",supportTarget).maybeSingle();effectiveProfile=target as PortalProfile;effectiveSourceUserId=identity?.source_user_id?String(identity.source_user_id):null;effectiveEmail=identity?.email||null;supportView={actor:{id:profile.id,name:profile.display_name,role:profile.role},target:{id:target.id,name:target.display_name,role:target.role},readOnly:true};}

  if (req.method === "GET" && url.pathname.endsWith("/me")) {
    return json({ user: { ...effectiveProfile, email: effectiveEmail }, supportView });
  }
  if (req.method === "GET" && url.pathname.endsWith("/dashboard")) {
    try { return json(dashboard((await loadRuntime(serviceClient)).state, effectiveProfile, effectiveSourceUserId)); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  if(req.method==="GET"&&routePath==="/weather/dwd/preview"){
    if(!isAdmin(profile))return json({error:"Keine Berechtigung"},403);
    try{const warnings=await new DwdWarningProvider().fetchActiveWarnings(),mapped=warnings.filter(item=>item.triggerCode);return json({provider:"DWD",received:warnings.length,mapped:mapped.length,unmapped:warnings.length-mapped.length,checkedAt:new Date().toISOString(),samples:mapped.slice(0,5).map(item=>({region:item.region,state:item.state,event:item.event,triggerCode:item.triggerCode,severity:item.severity}))});}
    catch(error){return json({error:`DWD-Livecheck fehlgeschlagen: ${error instanceof Error?error.message:"Unbekannter Fehler"}`},502);}
  }
  if (req.method === "GET") {
    try {
      const result=readRoute(routePath,(await loadRuntime(serviceClient)).state,effectiveProfile,effectiveSourceUserId,effectiveEmail);
      if(result)return json(result.body,result.status);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, Number((error as {status?:number}).status||503));
    }
  }
  if (["POST","PATCH","DELETE"].includes(req.method)) {
    try {
      const body=req.method==="DELETE"?{}:await req.json().catch(()=>{throw Object.assign(new Error("Ungültiges JSON"),{status:400})});
      const result=await writeRoute(req.method,routePath,{service:serviceClient,snapshot:await loadRuntime(serviceClient),profile,sourceUserId,body});
      if(result)return json(result.body,result.status);
    } catch(error) {
      return json({error:error instanceof Error?error.message:"Änderung fehlgeschlagen"},Number((error as {status?:number}).status||500));
    }
  }
  return json({ error: "Route nicht gefunden" }, 404);
});
