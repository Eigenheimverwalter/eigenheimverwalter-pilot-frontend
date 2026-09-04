import { corsHeaders } from "../_shared/cors.ts";
import {
  array, authenticate, isAdmin, loadRuntime, scopedProperties, sourcePartner,
  type PortalProfile,
} from "../_shared/runtime.ts";
import { readRoute } from "../_shared/read-routes.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ service: "ehv-pilot-portal-api", projectRef, status: "ok", version: "0.1.0" });
  }

  let auth;
  try { auth = await authenticate(req.headers.get("Authorization")); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Nicht angemeldet" }, Number((error as {status?:number}).status || 401)); }
  const { user, profile, sourceUserId, service: serviceClient } = auth;

  if (req.method === "GET" && url.pathname.endsWith("/me")) {
    return json({ user: { ...profile, email: user.email } });
  }
  if (req.method === "GET" && url.pathname.endsWith("/dashboard")) {
    try { return json(dashboard((await loadRuntime(serviceClient)).state, profile, sourceUserId)); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  if (req.method === "GET") {
    try {
      const routePath=url.pathname.replace(/^.*\/portal-api/,"")||"/";
      const result=readRoute(routePath,(await loadRuntime(serviceClient)).state,profile,sourceUserId,user.email||null);
      if(result)return json(result.body,result.status);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, Number((error as {status?:number}).status||503));
    }
  }
  return json({ error: "Route nicht gefunden" }, 404);
});
