import { corsHeaders } from "../_shared/cors.ts";
import {
  array, authenticate, identifier, isAdmin, loadRuntime, replaceRuntime, scopedProperties, sourcePartner,
  type PortalProfile,
} from "../_shared/runtime.ts";
import { readRoute } from "../_shared/read-routes.ts";
import { marketingKitRoute } from "../_shared/marketing-kit-route.ts";
import { writeRoute } from "../_shared/write-routes.ts";
import { DwdWarningProvider } from "../_shared/weather-providers.mjs";
import { sendPortalMail } from "../_shared/mail.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonResponse = (req:Request,body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const projectRef = "rpniwtshbwjuesoeztyt";
const partnerRoles = ["crafts_partner", "broker_partner", "partner_basic"];
const staffRoles = ["admin_light", "support_staff"];
const canUseSupportView = (profile: PortalProfile) => isAdmin(profile) || profile.role === "support_staff";
const safePortalBase = (value: unknown) => {
  try {
    const url = new URL(String(value || "")), host = url.hostname.toLowerCase();
    const allowed = url.protocol === "https:" && (host === "eigenheimverwalter.github.io" || host === "eigenheimverwalter.de" || host.endsWith(".eigenheimverwalter.de") || host === "eigenheimverwalter-pilot.de" || host.endsWith(".eigenheimverwalter-pilot.de") || host === "eigenheimverkauf.com" || host.endsWith(".eigenheimverkauf.com"));
    if (!allowed) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return null; }
};

const resolvePartnerPortalUser = async (
  serviceClient: SupabaseClient,
  state: Record<string, unknown>,
  selected: Record<string, unknown>,
) => {
  const email = String(selected.email || "").trim().toLowerCase();
  const linkedUser = array(state.users).find((item) =>
    String(item.id) === String(selected.userId || "") ||
    (email && String(item.email || "").trim().toLowerCase() === email)
  );
  const sourceIds = [...new Set([selected.userId, linkedUser?.id].filter(Boolean).map(String))];
  let identity: {auth_user_id?: string | null; source_user_id?: string | null} | null = null;
  for (const sourceId of sourceIds) {
    const { data, error } = await serviceClient.from("identity_imports")
      .select("auth_user_id,source_user_id").eq("source_user_id", sourceId).limit(1).maybeSingle();
    if (error) throw new Error("Partnerzugang konnte nicht geprüft werden");
    if (data?.auth_user_id) { identity = data; break; }
  }
  if (!identity?.auth_user_id && email) {
    const { data, error } = await serviceClient.from("identity_imports")
      .select("auth_user_id,source_user_id").ilike("email", email).not("auth_user_id", "is", null).limit(1).maybeSingle();
    if (error) throw new Error("Partnerzugang konnte nicht geprüft werden");
    if (data?.auth_user_id) identity = data;
  }
  if (!identity?.auth_user_id) return null;
  const { data: target, error } = await serviceClient.from("portal_users")
    .select("id,display_name,role,status").eq("id", identity.auth_user_id).eq("status", "active").limit(1).maybeSingle();
  if (error) throw new Error("Partnerprofil konnte nicht geprüft werden");
  if (!target || !partnerRoles.includes(String(target.role))) return null;
  return { target, sourceUserId: identity.source_user_id || linkedUser?.id || selected.userId || null };
};

const dashboard = (state: Record<string, unknown>, profile: PortalProfile, sourceUserId: string | null) => {
  const properties = profile.role === "support_staff" ? array(state.properties) : scopedProperties(state, profile, sourceUserId);
  const partner = sourcePartner(state, sourceUserId);
  const partners = canUseSupportView(profile) ? array(state.partners) : partner ? [partner] : [];
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
  if(req.method==="GET"&&routePath==="/access-management"){
    if(profile.role!=="super_admin"||String(user.email||"").toLowerCase()!=="info@eigenheimverwalter.de")return json({error:"Keine Berechtigung"},403);
    const {data:profiles,error}=await serviceClient.from("portal_users").select("id,display_name,role,status,created_at").in("role",staffRoles).order("created_at",{ascending:false});
    if(error)return json({error:"Mitarbeiterzugänge konnten nicht geladen werden"},503);
    const ids=(profiles||[]).map(item=>item.id),{data:identities}=ids.length?await serviceClient.from("identity_imports").select("auth_user_id,email,activation_status").in("auth_user_id",ids):{data:[]};
    return json({accounts:(profiles||[]).map(item=>{const identity=(identities||[]).find(row=>row.auth_user_id===item.id);return{id:item.id,name:item.display_name,email:identity?.email||"",role:item.role,status:item.status,activationStatus:identity?.activation_status||"activated",createdAt:item.created_at}}),roles:[{id:"admin_light",label:"Admin Light"},{id:"support_staff",label:"Support-Mitarbeiter"}]});
  }
  if(req.method==="POST"&&routePath==="/access-management/invitations"){
    if(profile.role!=="super_admin"||String(user.email||"").toLowerCase()!=="info@eigenheimverwalter.de")return json({error:"Nur der Super-Admin info@eigenheimverwalter.de darf Mitarbeiterzugänge erstellen"},403);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>,name=String(body.name||"").trim().slice(0,120),email=String(body.email||"").trim().toLowerCase().slice(0,254),role=String(body.role||""),siteUrl=safePortalBase(body.siteUrl);
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||!staffRoles.includes(role)||!siteUrl)return json({error:"Name, gültige E-Mail, Zugangsart und sichere Portaladresse sind erforderlich"},422);
    const {data:existing}=await serviceClient.from("identity_imports").select("source_user_id").ilike("email",email).limit(1).maybeSingle();if(existing)return json({error:"Für diese E-Mail-Adresse besteht bereits ein Zugang"},409);
    const sourceUserId=identifier("u-staff"),temporaryPassword=`${crypto.randomUUID()}Aa1!`;
    const {error:identityError}=await serviceClient.from("identity_imports").insert({source_user_id:sourceUserId,email,display_name:name,role,active:true,activation_status:"pending"});if(identityError)return json({error:"Mitarbeiteridentität konnte nicht vorbereitet werden"},409);
    const {data,error}=await serviceClient.auth.admin.generateLink({type:"signup",email,password:temporaryPassword,options:{redirectTo:`${siteUrl}/passwort-zuruecksetzen`}});
    if(error||!data?.properties?.action_link||!data.user?.id){await serviceClient.from("identity_imports").delete().eq("source_user_id",sourceUserId);return json({error:"Supabase-Zugang konnte nicht vorbereitet werden"},409)}
    await serviceClient.from("identity_imports").update({auth_user_id:data.user.id,activation_status:"invited"}).eq("source_user_id",sourceUserId);
    try{await sendPortalMail("info",email,"Ihr Zugang zum eigenheimverwalter Admin-Portal",`Hallo ${name},\n\nSie wurden als ${role==="admin_light"?"Admin Light":"Support-Mitarbeiter"} eingeladen. Über diesen einmaligen Link bestätigen Sie den Zugang und vergeben anschließend Ihr persönliches Passwort:\n${data.properties.action_link}\n\nDer Link ist vertraulich und darf nicht weitergegeben werden.`)}catch(mailError){await serviceClient.auth.admin.deleteUser(data.user.id);await serviceClient.from("identity_imports").delete().eq("source_user_id",sourceUserId);return json({error:mailError instanceof Error?mailError.message:"Einladungs-E-Mail konnte nicht versendet werden"},502)}
    await serviceClient.from("audit_events").insert({actor_user_id:profile.id,action:"staff.invitation.created",entity_type:"portal_user",entity_id:data.user.id,metadata:{role,sourceUserId}});
    return json({account:{id:data.user.id,name,email,role,status:"active",activationStatus:"invited"},delivery:{status:"sent",sender:"info@eigenheimverwalter.de"}},201);
  }
  if(req.method==="GET"&&routePath==="/support-view/users"){
    if(!canUseSupportView(profile))return json({error:"Keine Berechtigung"},403);
    const {data:profiles,error}=await serviceClient.from("portal_users").select("id,display_name,role,status").eq("status","active").in("role",partnerRoles);if(error)return json({error:"Partnerzugänge konnten nicht geladen werden"},503);
    return json({users:(profiles||[]).map(item=>({id:item.id,name:item.display_name,role:item.role})),mode:"read_only",notice:"Support-Sicht übernimmt ausschließlich die effektiven Leserechte. Änderungen sind gesperrt."});
  }
  if(req.method==="POST"&&routePath==="/support-view/start"){
    if(!canUseSupportView(profile))return json({error:"Keine Berechtigung"},403);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    let targetId=String(body.userId||"");
    if(body.partnerId){
      const snapshot=await loadRuntime(serviceClient),selected=array(snapshot.state.partners).find(item=>String(item.id)===String(body.partnerId));
      if(!selected||selected.status!=="active")return json({error:"Für diesen Partner ist kein aktiver Portalzugang verknüpft"},422);
      let resolved;
      try{resolved=await resolvePartnerPortalUser(serviceClient,snapshot.state,selected)}catch(error){return json({error:error instanceof Error?error.message:"Partnerzugang konnte nicht geprüft werden"},503)}
      if(!resolved)return json({error:"Für diesen Partner wurde noch kein aktiver Portal-Login eingerichtet"},422);
      targetId=String(resolved.target.id);
    }
    const {data:target}=await serviceClient.from("portal_users").select("id,display_name,role,status").eq("id",targetId).eq("status","active").maybeSingle();
    if(!target||!partnerRoles.includes(target.role))return json({error:"Bitte einen aktiven Partnerzugang auswählen"},422);
    await serviceClient.from("audit_events").insert({actor_user_id:profile.id,action:"support_view.started",entity_type:"portal_user",entity_id:target.id,metadata:{partnerId:body.partnerId||null,targetRole:target.role,readOnly:true}});
    return json({user:{id:target.id,name:target.display_name,role:target.role},csrf:null,supportView:{actor:{id:profile.id,name:profile.display_name,role:profile.role},target:{id:target.id,name:target.display_name,role:target.role},readOnly:true}});
  }
  if(req.method==="POST"&&routePath==="/support-view/stop"){await serviceClient.from("audit_events").insert({actor_user_id:profile.id,action:"support_view.stopped",entity_type:"portal_user",entity_id:profile.id,metadata:{readOnly:true}});return json({user:{id:profile.id,name:profile.display_name,email:user.email,role:profile.role},csrf:null,supportView:null});}
  if(profile.role==="support_staff"&&req.method!=="GET")return json({error:"Support-Mitarbeiter besitzen ausschließlich Leserechte"},403);
  let effectiveProfile=profile,effectiveSourceUserId=sourceUserId,effectiveEmail=user.email||null,supportView:null|Record<string,unknown>=null;
  const supportTarget=req.headers.get("x-ehv-support-user");
  if(supportTarget){if(!canUseSupportView(profile))return json({error:"Keine Berechtigung"},403);if(req.method!=="GET")return json({error:"Support-Sicht ist ausschließlich lesend"},403);const {data:target}=await serviceClient.from("portal_users").select("id,display_name,role,status,created_at").eq("id",supportTarget).eq("status","active").maybeSingle();if(!target)return json({error:"Support-Ziel ist nicht mehr verfügbar"},410);const {data:identity}=await serviceClient.from("identity_imports").select("source_user_id,email").eq("auth_user_id",supportTarget).maybeSingle();effectiveProfile=target as PortalProfile;effectiveSourceUserId=identity?.source_user_id?String(identity.source_user_id):null;effectiveEmail=identity?.email||null;supportView={actor:{id:profile.id,name:profile.display_name,role:profile.role},target:{id:target.id,name:target.display_name,role:target.role},readOnly:true};}

  if (req.method === "GET" && routePath === "/me") {
    return json({ user: { ...effectiveProfile, email: effectiveEmail }, supportView });
  }
  if (routePath === '/marketing-kit' || routePath.startsWith('/marketing-kit/')) {
    try {
      const partner=sourcePartner((await loadRuntime(serviceClient)).state,effectiveSourceUserId);
      const result=await marketingKitRoute(req,routePath,serviceClient,effectiveProfile,partner,Boolean(supportView));
      return json(result.body,result.status);
    } catch(error) {return json({error:error instanceof Error?error.message:'Marketing-Kit fehlgeschlagen'},Number((error as {status?:number}).status||500));}
  }
  if (req.method === "GET" && routePath === "/dashboard") {
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
