import { corsHeaders } from "../_shared/cors.ts";
import {
  array, authenticate, isAdmin, loadRuntime, scopedProperties, sourcePartner,
  type PortalProfile,
} from "../_shared/runtime.ts";

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
  if (req.method === "GET" && url.pathname.endsWith("/customers")) {
    if (!isAdmin(profile)) return json({ error: "Keine Berechtigung" }, 403);
    try { const state = (await loadRuntime(serviceClient)).state; return json({ customers: array(state.customers), source: "supabase" }); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  if (req.method === "GET" && url.pathname.endsWith("/partners")) {
    if (!isAdmin(profile)) return json({ error: "Keine Berechtigung" }, 403);
    try {
      const state = (await loadRuntime(serviceClient)).state;
      return json({
        partners: array(state.partners), trades: array(state.trades), organizations: array(state.partnerOrganizations),
        roleTemplates: array(state.partnerRoleTemplates), source: "supabase",
      });
    }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  return json({ error: "Route nicht gefunden" }, 404);
});
