import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RuntimeState = Record<string, unknown>;
export type PortalProfile = { id: string; display_name: string; role: string; status: string; created_at: string };
export type RuntimeSnapshot = { state: RuntimeState; revision: number };

export const array = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value as Record<string, unknown>[] : [];

export const serviceClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const userClient = (authorization: string) => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } },
);

export async function authenticate(authorization: string | null) {
  if (!authorization) throw Object.assign(new Error("Nicht angemeldet"), { status: 401 });
  const client = userClient(authorization);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw Object.assign(new Error("Sitzung ungültig"), { status: 401 });
  const { data: profile, error: profileError } = await client.from("portal_users")
    .select("id,display_name,role,status,created_at").eq("id", user.id).single();
  if (profileError || !profile || profile.status !== "active") {
    throw Object.assign(new Error("Portalprofil nicht eingerichtet oder nicht aktiv"), { status: 403 });
  }
  const service = serviceClient();
  const { data: identity } = await service.from("identity_imports")
    .select("source_user_id").eq("auth_user_id", user.id).maybeSingle();
  return { user, profile: profile as PortalProfile, sourceUserId: identity?.source_user_id ? String(identity.source_user_id) : null, service };
}

export async function loadRuntime(service: SupabaseClient): Promise<RuntimeSnapshot> {
  const { data, error } = await service.from("portal_runtime_state").select("payload,revision").eq("id", "primary").single();
  if (error || !data?.payload) throw Object.assign(new Error("Pilot-Laufzeitstand nicht verfügbar"), { status: 503 });
  return { state: data.payload as RuntimeState, revision: Number(data.revision || 1) };
}

export async function replaceRuntime(
  service: SupabaseClient,
  snapshot: RuntimeSnapshot,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  const { data, error } = await service.rpc("replace_portal_runtime_state", {
    expected_revision: snapshot.revision,
    next_payload: snapshot.state,
    audit_actor: actorId,
    audit_action: action,
    audit_entity_type: entityType,
    audit_entity_id: entityId,
    audit_metadata: metadata,
  });
  if (error) {
    const conflict = String(error.message).includes("runtime_revision_conflict");
    throw Object.assign(new Error(conflict ? "Die Daten wurden parallel geändert. Bitte erneut versuchen." : "Änderung konnte nicht gespeichert werden"), { status: conflict ? 409 : 500 });
  }
  return Array.isArray(data) ? data[0] : data;
}

export const isAdmin = (profile: PortalProfile) => ["super_admin", "admin_light"].includes(profile.role);
export const requireRole = (profile: PortalProfile, roles: string[]) => {
  if (!roles.includes(profile.role)) throw Object.assign(new Error("Keine Berechtigung"), { status: 403 });
};

export function sourcePartner(state: RuntimeState, sourceUserId: string | null) {
  return array(state.partners).find((item) => String(item.userId ?? "") === String(sourceUserId ?? "")) ?? null;
}

export function scopedProperties(state: RuntimeState, profile: PortalProfile, sourceUserId: string | null) {
  const properties = array(state.properties);
  if (isAdmin(profile)) return properties;
  const partner = sourcePartner(state, sourceUserId);
  if (!partner) return [];
  const ids = new Set(array(state.assignments)
    .filter((item) => item.partnerId === partner.id && item.status === "active")
    .map((item) => item.propertyId));
  return properties.filter((item) => ids.has(item.id));
}

export const clean = (value: unknown, length = 500) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0, length);
export const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const publicRuntimeUser = (row: Record<string, unknown>) => {
  const { passwordHash: _passwordHash, password: _password, token: _token, secret: _secret, ...safe } = row;
  return safe;
};
