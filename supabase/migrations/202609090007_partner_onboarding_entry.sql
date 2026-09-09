-- Phase 5: invitation entry only. No runtime partner, licence or payment writes.
-- Pending profiles remain INVITED: authenticate() only permits their own
-- onboarding routes; documents, dashboards and all ordinary APIs stay blocked.
-- Existing active profiles and previously applied migrations are unchanged.
create or replace function public.partner_onboarding_step(p_action text,p_id uuid,p_actor uuid,p_token_hash text default null,p_version bigint default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings; actor_email text; actor_role text; admin_read boolean;
  values_data jsonb; f text; complete boolean; next_status text;
begin
  if p_action is null or p_action not in ('READ','START','SAVE_DATA','CANCEL') then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  select lower(u.email),p.role into actor_email,actor_role from auth.users u join public.portal_users p on p.id=u.id
    where u.id=p_actor and u.email_confirmed_at is not null and (p.status='active' or (p.status='invited' and p.role='partner_basic'));
  if actor_email is null then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
  admin_read:=p_action='READ' and public.onboarding_admin_allowed(p_actor,'partners.read');
  select * into flow from public.partner_onboardings where id=p_id and orchestration_version=3 for update;
  if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  if not admin_read then
    if actor_role not in ('partner_basic','referral_partner','crafts_partner','broker_partner') then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
    if flow.auth_user_id is distinct from p_actor then
      if p_action<>'START' or flow.auth_user_id is not null or p_token_hash is null or flow.token_hash is distinct from p_token_hash
        then raise exception 'ONBOARDING_NOT_FOUND'; end if;
      if actor_email is distinct from flow.prefilled_data->>'email' then raise exception 'ONBOARDING_IDENTITY_MISMATCH'; end if;
    elsif actor_email is distinct from flow.prefilled_data->>'email' then raise exception 'ONBOARDING_IDENTITY_MISMATCH'; end if;
  end if;
  if p_action='READ' then
    if flow.expires_at<=now() and flow.status in ('CREATED','INVITED','STARTED','DATA_INCOMPLETE','DATA_COMPLETE','LEGAL_PENDING','LEGAL_ACCEPTED') then
      return (to_jsonb(flow)-'token_hash')||jsonb_build_object('status','EXPIRED');
    end if;
    return to_jsonb(flow)-'token_hash';
  end if;
  if flow.expires_at is null or flow.expires_at<=now() then raise exception 'ONBOARDING_EXPIRED'; end if;
  if flow.status in ('ACTIVE','CANCELLED','EXPIRED','CHECKOUT_PENDING','PAYMENT_PENDING','READY_FOR_ACTIVATION','PAYMENT_FAILED') then raise exception 'ONBOARDING_NOT_OPEN'; end if;
  if p_action='START' then
    if flow.status in ('CREATED','INVITED') then
      update public.partner_onboardings set auth_user_id=p_actor,identity_verified=true,token_claimed_at=coalesce(token_claimed_at,now()),
        status='STARTED',version=version+1,updated_at=now() where id=p_id returning * into flow;
      insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
        values(p_actor,'partner_onboarding_started','partner_onboarding',p_id::text,'{}');
    end if;
  else
    if p_version is null or flow.version<>p_version then raise exception 'ONBOARDING_CHANGED'; end if;
    if p_action='CANCEL' then
      update public.partner_onboardings set status='CANCELLED',version=version+1,updated_at=now() where id=p_id returning * into flow;
    else
      if flow.status not in ('STARTED','DATA_INCOMPLETE','DATA_COMPLETE','LEGAL_PENDING') then raise exception 'ONBOARDING_DATA_LOCKED'; end if;
      if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k
        where k not in ('company','contact_name','phone','address','postal_code','city')) then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
      foreach f in array array['company','contact_name','phone','address','postal_code','city'] loop
        if jsonb_typeof(p_data->f) is distinct from 'string' or length(p_data->>f)>(case f when 'company' then 180 when 'contact_name' then 120 when 'phone' then 50 when 'address' then 180 when 'postal_code' then 5 else 100 end)
          or p_data->>f ~ '[[:cntrl:]]' then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
      end loop;
      values_data:=flow.prefilled_data||p_data;
      if exists(select 1 from public.legal_acceptances where onboarding_id=p_id) and values_data<>flow.prefilled_data then raise exception 'ONBOARDING_DATA_LOCKED'; end if;
      complete:=not exists(select 1 from unnest(array['company','contact_name','email','phone','address','postal_code','city']) k where nullif(btrim(values_data->>k),'') is null)
        and coalesce(values_data->>'postal_code','') ~ '^[0-9]{5}$';
      next_status:=case when complete then 'DATA_COMPLETE' else 'DATA_INCOMPLETE' end;
      update public.partner_onboardings set prefilled_data=values_data,status=next_status,version=version+1,updated_at=now() where id=p_id returning * into flow;
    end if;
    insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
      values(p_actor,case p_action when 'CANCEL' then 'partner_onboarding_cancelled' else 'partner_onboarding_data_saved' end,
        'partner_onboarding',p_id::text,jsonb_build_object('status',flow.status,'version',flow.version));
  end if;
  return to_jsonb(flow)-'token_hash';
end $$;

create or replace function public.validate_legal_acceptance_identity() returns trigger
language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings;
begin
  select * into flow from public.partner_onboardings where id=new.onboarding_id;
  if flow.expires_at is null or flow.expires_at<=now() then raise exception 'ONBOARDING_EXPIRED'; end if;
  if flow.auth_user_id is null or not exists (
    select 1 from auth.users u join public.portal_users p on p.id=u.id
    where u.id=flow.auth_user_id and u.email_confirmed_at is not null
      and lower(u.email)=lower(flow.prefilled_data->>'email')
      and (p.status='active' or (p.status='invited' and p.role='partner_basic')) and p.role in ('partner_basic','referral_partner','crafts_partner','broker_partner')
  ) then raise exception 'ACCEPTANCE_IDENTITY_MISMATCH'; end if;
  return new;
end $$;

create or replace function public.partner_legal_step(
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
    where u.id=p_actor and u.email_confirmed_at is not null and (p.status='active' or (p.status='invited' and p.role='partner_basic'))
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

-- Token inspection and identity binding live on the central service, not a
-- second signup architecture. Auth itself stays in Supabase Auth.
create function public.partner_onboarding_entry(
  p_action text,p_id uuid,p_token_hash text,p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings; actor_email text; actor_status text; actor_role text;
begin
  if p_action is null or p_action not in ('INSPECT','CLAIM') then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  select * into flow from public.partner_onboardings where id=p_id and orchestration_version=3 for update;
  if not found or flow.token_hash is distinct from p_token_hash then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  if flow.expires_at is null or flow.expires_at<=now() then raise exception 'ONBOARDING_EXPIRED'; end if;
  if flow.status in ('CANCELLED','EXPIRED','ACTIVE') then raise exception 'ONBOARDING_NOT_OPEN'; end if;
  if p_action='INSPECT' then
    if flow.auth_user_id is not null then
      return jsonb_build_object('registered',true,'requested_plan',flow.requested_plan);
    end if;
    return jsonb_build_object('registered',false,'requested_plan',flow.requested_plan,
      'email',flow.prefilled_data->>'email','company',flow.prefilled_data->>'company','contact_name',flow.prefilled_data->>'contact_name',
      'login_required',exists(select 1 from auth.users where lower(email)=lower(flow.prefilled_data->>'email'))
        or exists(select 1 from public.identity_imports where lower(email)=lower(flow.prefilled_data->>'email')));
  end if;
  select lower(email) into actor_email from auth.users where id=p_actor and email_confirmed_at is not null;
  if actor_email is null or actor_email is distinct from lower(flow.prefilled_data->>'email')
    then raise exception 'ONBOARDING_IDENTITY_MISMATCH'; end if;
  if flow.auth_user_id is not null and flow.auth_user_id<>p_actor then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  select role,status into actor_role,actor_status from public.portal_users where id=p_actor for update;
  if found then
    if actor_role not in ('partner_basic','referral_partner','crafts_partner','broker_partner')
      or not (actor_status='active' or (actor_status='invited' and actor_role='partner_basic'))
      then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
  else
    -- Never revive/import a disabled identity or silently change an existing role.
    if exists(select 1 from public.identity_imports where auth_user_id=p_actor or lower(email)=actor_email)
      then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
    insert into public.portal_users(id,display_name,role,status)
      values(p_actor,left(coalesce(flow.prefilled_data->>'contact_name',''),120),'partner_basic','invited');
    insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
      values(p_actor,'partner_onboarding_identity_prepared','partner_onboarding',p_id::text,'{"access":"onboarding_only"}');
  end if;
  -- Reuse the same START transition and ownership checks as all other sources.
  return public.partner_onboarding_step('START',p_id,p_actor,p_token_hash);
end $$;
revoke all on function public.partner_onboarding_entry(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.partner_onboarding_entry(text,uuid,text,uuid) to service_role;
