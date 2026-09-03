import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Nicht angemeldet" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sitzung ungültig" }, 401);
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const documentId = url.searchParams.get("id");
  if (req.method !== "GET" || !documentId) return json({ error: "Route nicht unterstützt" }, 405);
  const { data: document, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (error || !document) return json({ error: "Dokument nicht gefunden oder nicht freigegeben" }, 404);
  const { data: signed, error: signedError } = await service.storage.from(document.bucket_id)
    .createSignedUrl(document.object_path, 60);
  if (signedError) return json({ error: "Dokument konnte nicht bereitgestellt werden" }, 500);
  await service.from("audit_events").insert({
    actor_user_id: user.id, action: "document.viewed", entity_type: "document",
    entity_id: document.id, metadata: { bucket: document.bucket_id },
  });
  return json({ url: signed.signedUrl, expiresIn: 60 });
});
