-- Phase 2: own-identity legal acceptance. No legacy entry point is switched and
-- no partner/license/payment is activated by this migration or these functions.
alter table public.partner_onboardings add column required_document_types text[]
  not null default array['TERMS','PRIVACY']::text[]
  check (required_document_types @> array['TERMS','PRIVACY']::text[]
    and cardinality(required_document_types) between 2 and 20
    and array_position(required_document_types,null) is null);

-- Defence in depth for direct service writes as well as the atomic RPC below.
create function public.validate_legal_acceptance_identity() returns trigger
language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings;
begin
  select * into flow from public.partner_onboardings where id=new.onboarding_id;
  if flow.expires_at is null or flow.expires_at<=now() then raise exception 'ONBOARDING_EXPIRED'; end if;
  if flow.auth_user_id is null or not exists (
    select 1 from auth.users u join public.portal_users p on p.id=u.id
    where u.id=flow.auth_user_id and u.email_confirmed_at is not null
      and lower(u.email)=lower(flow.prefilled_data->>'email')
      and p.status='active' and p.role in ('partner_basic','referral_partner','crafts_partner','broker_partner')
  ) then raise exception 'ACCEPTANCE_IDENTITY_MISMATCH'; end if;
  return new;
end $$;
create trigger legal_acceptance_verified_identity before insert on public.legal_acceptances
  for each row execute function public.validate_legal_acceptance_identity();

-- Called only with the identity returned by Supabase Auth, never a browser actor
-- field. Shared type locks use the same ordering as document activation/retention.
create function public.partner_legal_step(
  p_action text,p_onboarding uuid,p_actor uuid,
  p_documents jsonb default '[]',p_document uuid default null,
  p_ip inet default null,p_user_agent text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings; initial_version bigint; kind text;
  doc public.legal_documents; entry jsonb; evidence public.legal_acceptances;
  result_documents jsonb:='[]'; missing_types jsonb:='[]';
  required_types text[]; submitted_count integer; accepted_all boolean:=true;
  data_complete boolean; file_result jsonb; actor_email text;
begin
  if p_action not in ('READ','VIEW','ACCEPT') then raise exception 'LEGAL_ACTION_INVALID'; end if;
  -- Same result for unknown IDs and another user's ID: no existence oracle.
  select * into flow from public.partner_onboardings where id=p_onboarding and auth_user_id=p_actor;
  if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  initial_version:=flow.version;
  select lower(u.email) into actor_email from auth.users u join public.portal_users p on p.id=u.id
    where u.id=p_actor and u.email_confirmed_at is not null and p.status='active'
      and p.role in ('partner_basic','referral_partner','crafts_partner','broker_partner');
  if not flow.identity_verified or actor_email is null or actor_email is distinct from lower(flow.prefilled_data->>'email')
    then raise exception 'ACCEPTANCE_IDENTITY_MISMATCH'; end if;
  select array_agg(distinct t order by t) into required_types from unnest(flow.required_document_types) t;
  foreach kind in array required_types loop
    perform pg_advisory_xact_lock(hashtextextended('legal:'||kind,0));
  end loop;
  select * into flow from public.partner_onboardings where id=p_onboarding for update;
  if flow.version<>initial_version or flow.auth_user_id is distinct from p_actor then raise exception 'ONBOARDING_CHANGED'; end if;
  if flow.expires_at is null or flow.expires_at<=now() then raise exception 'ONBOARDING_EXPIRED'; end if;
  if flow.status in ('ACTIVE','CANCELLED','EXPIRED') then raise exception 'ONBOARDING_NOT_OPEN'; end if;

  data_complete:=not exists(select 1 from unnest(array['company','contact_name','email','phone','address','postal_code','city']) f
    where nullif(btrim(flow.prefilled_data->>f),'') is null)
    and coalesce(flow.prefilled_data->>'postal_code','') ~ '^[0-9]{5}$'
    and coalesce(flow.prefilled_data->>'email','') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  if p_action='ACCEPT' then
    if not data_complete or flow.status not in ('DATA_COMPLETE','LEGAL_PENDING','LEGAL_ACCEPTED','CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED')
      then raise exception 'ONBOARDING_DATA_REQUIRED'; end if;
    if jsonb_typeof(p_documents) is distinct from 'array' then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
    select count(distinct x->>'id') into submitted_count from jsonb_array_elements(p_documents) x;
    if submitted_count<>cardinality(required_types) or jsonb_array_length(p_documents)<>cardinality(required_types)
      then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
  end if;

  foreach kind in array required_types loop
    select * into doc from public.legal_documents where document_type=kind and status='ACTIVE'
      and deletion_requested_at is null and effective_from is not null and effective_from<=now() for share;
    if not found then
      if p_action='ACCEPT' then raise exception 'LEGAL_DOCUMENTS_UNAVAILABLE'; end if;
      missing_types:=missing_types||to_jsonb(kind); accepted_all:=false; continue;
    end if;
    -- Reuse an upgrade acceptance only for the same verified user, same partner,
    -- same email and exact active version; never just because an email matches.
    select a.* into evidence from public.legal_acceptances a join public.partner_onboardings prior on prior.id=a.onboarding_id
      where a.legal_document_id=doc.id and a.document_version=doc.version
        and a.accepted_by_email=actor_email and prior.auth_user_id=p_actor
        and (a.onboarding_id=flow.id or (flow.existing_partner_id is not null and a.partner_id=flow.existing_partner_id))
      order by a.accepted_at limit 1;
    if p_action='ACCEPT' then
      select x into entry from jsonb_array_elements(p_documents) x where x->>'id'=doc.id::text;
      if entry is null or entry->>'version' is distinct from doc.version::text then raise exception 'LEGAL_VERSION_CONFLICT'; end if;
      if entry->'accepted' is distinct from 'true'::jsonb then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
      if evidence.id is null then
        insert into public.legal_acceptances(onboarding_id,legal_document_id,document_type,document_version,accepted_by_email,acceptance_text,accepted_ip,user_agent)
          values(flow.id,doc.id,doc.document_type,doc.version,actor_email,doc.acceptance_text,p_ip,
            left(regexp_replace(coalesce(p_user_agent,''),'[[:cntrl:]]','','g'),512)) returning * into evidence;
        insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
          values(p_actor,'legal_document_accepted','legal_document',doc.id::text,
            jsonb_build_object('onboardingId',flow.id,'documentType',doc.document_type,'version',doc.version,'acceptanceId',evidence.id));
      end if;
    end if;
    if evidence.id is null then accepted_all:=false; end if;
    result_documents:=result_documents||jsonb_build_object('id',doc.id,'documentType',doc.document_type,
      'title',doc.title,'name',doc.file_name,'mimeType',doc.mime_type,'size',doc.file_size,
      'version',doc.version,'effectiveFrom',doc.effective_from,'acceptanceText',doc.acceptance_text,
      'accepted',evidence.id is not null,'acceptedAt',evidence.accepted_at);
    if p_action='VIEW' and doc.id=p_document then
      file_result:=jsonb_build_object('storage_path',doc.storage_path,'name',doc.file_name);
      insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
        values(p_actor,'legal_document_viewed','legal_document',doc.id::text,
          jsonb_build_object('onboardingId',flow.id,'documentType',doc.document_type,'version',doc.version,'delivery','private_preview_requested'));
    end if;
  end loop;
  if p_action='VIEW' and file_result is null then raise exception 'LEGAL_DOCUMENT_NOT_FOUND'; end if;
  if p_action='ACCEPT' and flow.status in ('DATA_COMPLETE','LEGAL_PENDING') then
    update public.partner_onboardings set status='LEGAL_ACCEPTED',version=version+1,updated_at=now()
      where id=flow.id returning * into flow;
  end if;
  -- LEGAL_ACCEPTED is not ACTIVE. Phase 3/7 must apply the remaining gates.
  return jsonb_build_object('onboardingId',flow.id,'onboardingStatus',flow.status,
    'plan',flow.requested_plan,'documents',result_documents,'missingDocumentTypes',missing_types,
    'accepted',accepted_all,'dataComplete',data_complete,'file',file_result);
end $$;
revoke all on function public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text) from public,anon,authenticated;
grant execute on function public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text) to service_role;

-- Administrative previews must also be audited, without paths, IPs, user agents
-- or consent text in the general audit log. Signing follows a successful audit.
create function public.audit_legal_preview(p_document uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare doc public.legal_documents; actor_role text; allowed jsonb;
begin
  select role into actor_role from public.portal_users where id=p_actor and status='active';
  if actor_role is null or actor_role not in ('super_admin','admin_light') then raise exception 'LEGAL_PERMISSION_DENIED'; end if;
  if actor_role='admin_light' then
    select r->'permissions' into allowed from public.portal_runtime_state s,
      lateral jsonb_array_elements(coalesce(s.payload->'roleProfiles','[]'::jsonb)) r
      where s.id='primary' and r->>'role'='admin_light' limit 1;
    if not coalesce(allowed ? '*',false) and not coalesce(allowed ? 'legal_documents.read',false) then raise exception 'LEGAL_PERMISSION_DENIED'; end if;
  end if;
  select * into doc from public.legal_documents where id=p_document and deletion_requested_at is null;
  if not found then raise exception 'LEGAL_DOCUMENT_NOT_FOUND'; end if;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
    values(p_actor,'legal_document_viewed','legal_document',doc.id::text,
      jsonb_build_object('documentType',doc.document_type,'version',doc.version,'delivery','private_preview_requested','context','admin'));
end $$;
revoke all on function public.audit_legal_preview(uuid,uuid) from public,anon,authenticated;
grant execute on function public.audit_legal_preview(uuid,uuid) to service_role;
