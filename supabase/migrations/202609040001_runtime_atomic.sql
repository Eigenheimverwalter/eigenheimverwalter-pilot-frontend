alter table public.portal_runtime_state
  add column if not exists revision bigint not null default 1;

create or replace function public.replace_portal_runtime_state(
  expected_revision bigint,
  next_payload jsonb,
  audit_actor uuid,
  audit_action text,
  audit_entity_type text default 'portal_runtime_state',
  audit_entity_id text default 'primary',
  audit_metadata jsonb default '{}'::jsonb
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_payload is null or jsonb_typeof(next_payload) <> 'object' then
    raise exception 'invalid_runtime_payload';
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

revoke all on function public.replace_portal_runtime_state(bigint,jsonb,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.replace_portal_runtime_state(bigint,jsonb,uuid,text,text,text,jsonb) to service_role;

comment on function public.replace_portal_runtime_state(bigint,jsonb,uuid,text,text,text,jsonb) is
  'Atomically replaces the transitional Pilot runtime snapshot and writes its audit event.';
