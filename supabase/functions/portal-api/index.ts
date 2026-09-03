import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const projectRef = "rpniwtshbwjuesoeztyt";

type RuntimeState = Record<string, unknown>;
type PortalProfile = { id: string; display_name: string; role: string; status: string; created_at: string };

const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value as Record<string, unknown>[] : [];
const runtimeState = async (client: ReturnType<typeof createClient>): Promise<RuntimeState> => {
  const { data, error } = await client.from("portal_runtime_state").select("payload").eq("id", "primary").single();
  if (error || !data?.payload) throw new Error("Pilot-Laufzeitstand nicht verfügbar");
  return data.payload as RuntimeState;
};

const dashboard = (state: RuntimeState) => {
  const customers = array(state.customers), properties = array(state.properties), partners = array(state.partners);
  const services = array(state.serviceCases), opportunities = array(state.partnerOpportunities);
  return {
    kpis: {
      customers: customers.length,
      properties: properties.length,
      activePartners: partners.filter((item) => item.status === "active").length,
      openServices: services.filter((item) => !["done", "cancelled"].includes(String(item.status))).length,
      openOpportunities: opportunities.filter((item) => !["completed", "rejected"].includes(String(item.status))).length,
    },
    source: "supabase",
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ service: "ehv-pilot-portal-api", projectRef, status: "ok", version: "0.1.0" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Nicht angemeldet" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sitzung ungültig" }, 401);

  const { data: profile, error: profileError } = await userClient.from("portal_users")
    .select("id,display_name,role,status,created_at").eq("id", user.id).single();
  if (profileError || !profile || profile.status !== "active") return json({ error: "Portalprofil nicht eingerichtet oder nicht aktiv" }, 403);

  if (req.method === "GET" && url.pathname.endsWith("/me")) {
    return json({ user: { ...profile, email: user.email } });
  }
  if (req.method === "GET" && url.pathname.endsWith("/dashboard")) {
    try { return json(dashboard(await runtimeState(serviceClient))); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  if (req.method === "GET" && url.pathname.endsWith("/customers")) {
    if (!(profile as PortalProfile).role.match(/^(super_admin|admin_light)$/)) return json({ error: "Keine Berechtigung" }, 403);
    try { const state = await runtimeState(serviceClient); return json({ customers: array(state.customers), source: "supabase" }); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  if (req.method === "GET" && url.pathname.endsWith("/partners")) {
    if (!(profile as PortalProfile).role.match(/^(super_admin|admin_light)$/)) return json({ error: "Keine Berechtigung" }, 403);
    try { const state = await runtimeState(serviceClient); return json({ partners: array(state.partners), source: "supabase" }); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Datenzugriff fehlgeschlagen" }, 503); }
  }
  return json({ error: "Route nicht gefunden" }, 404);
});
