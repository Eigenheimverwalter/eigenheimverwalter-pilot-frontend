import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const projectRef = "rpniwtshbwjuesoeztyt";

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
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sitzung ungültig" }, 401);

  if (req.method === "GET" && url.pathname.endsWith("/me")) {
    const { data: profile, error } = await userClient.from("portal_users")
      .select("id,display_name,role,status,created_at").eq("id", user.id).single();
    if (error || !profile) return json({ error: "Portalprofil nicht eingerichtet" }, 403);
    return json({ user: { ...profile, email: user.email } });
  }
  return json({ error: "Route nicht gefunden" }, 404);
});
