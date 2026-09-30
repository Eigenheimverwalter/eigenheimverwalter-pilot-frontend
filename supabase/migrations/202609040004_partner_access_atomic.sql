create or replace function public.replace_portal_runtime_and_access(
  expected_revision bigint,
  next_payload jsonb,
  audit_actor uuid,
  audit_action text,
  audit_entity_type text,
  audit_entity_id text,
  access_source_user_id text,
  access_status text,
  audit_metadata jsonb default '{}'::jsonb
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_auth_user_id uuid;
begin
  if next_payload is null or jsonb_typeof(next_payload) <> 'object' then
    raise exception 'invalid_runtime_payload';
  end if;
  if access_status not in ('active', 'disabled') then
    raise exception 'invalid_portal_access_status';
  end if;

  select auth_user_id into target_auth_user_id
    from public.identity_imports
   where source_user_id = access_source_user_id
   limit 1;

  if target_auth_user_id is not null then
    update public.portal_users
       set status = access_status,
           updated_at = now()
     where id = target_auth_user_id;
    if not found then
      raise exception 'portal_profile_not_found';
    end if;
  end if;

  update public.portal_runtime_state
     set payload = next_payload,
         revision = portal_runtime_state.revision + 1,
         updated_at = now()
   where id = 'primary'
     and portal_runtime_state.revision = expected_revision
  returning portal_runtime_state.revision, portal_runtime_state.updated_at
       into revision, updated_at;

  if not found then
    raise exception 'runtime_revision_conflict';
  end if;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, metadata)
  values(audit_actor, audit_action, audit_entity_type, audit_entity_id, coalesce(audit_metadata, '{}'::jsonb));
  return next;
end;
$$;

revoke all on function public.replace_portal_runtime_and_access(bigint,jsonb,uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.replace_portal_runtime_and_access(bigint,jsonb,uuid,text,text,text,text,text,jsonb) to service_role;

comment on function public.replace_portal_runtime_and_access(bigint,jsonb,uuid,text,text,text,text,text,jsonb) is
  'Atomically updates the transitional Pilot runtime snapshot, partner portal access and audit trail.';
