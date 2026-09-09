-- Phase 3: one durable orchestration service on the existing onboarding table.
-- No legacy activation, partner, role, licence or property data is rewritten.
alter table public.partner_onboardings
  add column orchestration_version integer,
  add column creation_key uuid,
  add column created_by uuid references public.portal_users(id) on delete restrict,
  add column token_claimed_at timestamptz,
  add column invitation_delivery_ref text;
create unique index partner_onboarding_creation_key on public.partner_onboardings(source,creation_key)
  where creation_key is not null;
create unique index partner_onboarding_open_email on public.partner_onboardings(lower(prefilled_data->>'email'))
  where orchestration_version=3 and status not in ('ACTIVE','CANCELLED','EXPIRED');

create function public.onboarding_admin_allowed(p_actor uuid,p_permission text) returns boolean
language plpgsql security definer set search_path=public as $$
declare actor_role text; permissions jsonb;
begin
  select role into actor_role from public.portal_users where id=p_actor and status='active';
  if actor_role='super_admin' then return true; end if;
  if actor_role is distinct from 'admin_light' then return false; end if;
  select r->'permissions' into permissions from public.portal_runtime_state s,
    lateral jsonb_array_elements(coalesce(s.payload->'roleProfiles','[]'::jsonb)) r
    where s.id='primary' and r->>'role'='admin_light' limit 1;
  return coalesce(permissions ? '*',false) or coalesce(permissions ? p_permission,false);
end $$;

create function public.create_partner_onboarding(p_actor uuid,p_input jsonb,p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings; prior public.partner_onboardings;
  entry_source text:=p_input->>'source'; plan text:=p_input->>'requested_plan'; kind text:=p_input->>'partner_type';
  equipment text:=nullif(p_input->>'equipment_type',''); partner_ref text:=nullif(p_input->>'existing_partner_id','');
  lead_ref text:=nullif(p_input->>'sales_lead_id',''); invite_ref text:=nullif(p_input->>'invite_id','');
  values_data jsonb:=p_input->'prefilled_data'; email_value text; actor_email text; actor_role text;
  own_entry boolean; linked_partner jsonb; runtime_data jsonb; request_key uuid; f text;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(values_data) is distinct from 'object'
    or entry_source is null or entry_source not in ('SELF_SERVICE_BASIC','SELF_SERVICE_PREMIUM','SALES_OS','ADMIN_INVITE','CRM_IMPORT')
    or plan is null or plan not in ('BASIC','PREMIUM') or kind is null or kind not in ('EQUIPMENT_PARTNER','BROKER_PARTNER','REFERRAL')
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or coalesce(p_input->>'request_key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  request_key:=(p_input->>'request_key')::uuid;
  email_value:=lower(btrim(values_data->>'email'));
  if email_value is null or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email_value)>254
    or (entry_source='SALES_OS' and lead_ref is null)
    or (entry_source='SELF_SERVICE_BASIC' and plan<>'BASIC') or (entry_source='SELF_SERVICE_PREMIUM' and plan<>'PREMIUM')
    or (plan='PREMIUM' and kind='REFERRAL') then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  foreach f in array array['company','contact_name','email','phone','address','postal_code','city'] loop
    if jsonb_typeof(values_data->f) is distinct from 'string' or length(values_data->>f)>254
      or values_data->>f ~ '[[:cntrl:]]' then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  end loop;
  values_data:=jsonb_build_object('company',values_data->>'company','contact_name',values_data->>'contact_name',
    'email',email_value,'phone',values_data->>'phone','address',values_data->>'address','postal_code',values_data->>'postal_code','city',values_data->>'city');
  own_entry:=entry_source in ('SELF_SERVICE_BASIC','SELF_SERVICE_PREMIUM');
  select lower(u.email),p.role into actor_email,actor_role from auth.users u join public.portal_users p on p.id=u.id
    where u.id=p_actor and u.email_confirmed_at is not null and p.status='active';
  if own_entry then
    if actor_role is null or actor_role not in ('partner_basic','referral_partner','crafts_partner','broker_partner')
      or actor_email is distinct from email_value then raise exception 'ONBOARDING_IDENTITY_MISMATCH'; end if;
  elsif entry_source='SALES_OS' then
    -- Only an authenticated server-to-server adapter may supply this source.
    -- The browser adapter never accepts it; this RPC is service-role-only.
    if p_actor is not null then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
  elsif not public.onboarding_admin_allowed(p_actor,'partners.write') or actor_email is null then
    raise exception 'ONBOARDING_PERMISSION_DENIED';
  end if;
  -- Serialize short create transactions across entry sources, including aliases
  -- of the same email and repeated WON/invite deliveries. No external IO inside.
  perform pg_advisory_xact_lock(hashtextextended('partner-onboarding:create',0));
  select payload into runtime_data from public.portal_runtime_state where id='primary' for share;
  if runtime_data is null then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  if kind='EQUIPMENT_PARTNER' and not exists(select 1 from jsonb_array_elements(coalesce(runtime_data->'trades','[]')) t
    where t->>'id'=equipment and coalesce(t->>'onboarding','true')<>'false' and coalesce(t->>'tier','')<>'legacy'
      and t->>'id' not in ('BROKER','broker','whitelabel')) then raise exception 'EQUIPMENT_TYPE_REQUIRED'; end if;
  if kind<>'EQUIPMENT_PARTNER' then equipment:=null; end if;
  if partner_ref is not null then
    select p into linked_partner from jsonb_array_elements(coalesce(runtime_data->'partners','[]')) p where p->>'id'=partner_ref;
    if linked_partner is null or lower(btrim(linked_partner->>'email')) is distinct from email_value then raise exception 'ONBOARDING_PARTNER_LINK_REQUIRED'; end if;
    if own_entry and not exists(select 1 from public.identity_imports i where i.auth_user_id=p_actor and i.source_user_id=linked_partner->>'userId')
      then raise exception 'ONBOARDING_PARTNER_LINK_REQUIRED'; end if;
  elsif exists(select 1 from jsonb_array_elements(coalesce(runtime_data->'partners','[]')) p where lower(btrim(p->>'email'))=email_value) then
    raise exception 'ONBOARDING_PARTNER_LINK_REQUIRED';
  end if;
  select * into prior from public.partner_onboardings where source=entry_source and
    (creation_key=request_key or (lead_ref is not null and sales_lead_id=lead_ref) or (invite_ref is not null and invite_id=invite_ref))
    order by created_at limit 1 for update;
  if found then
    if prior.orchestration_version is distinct from 3 or prior.created_by is distinct from p_actor
      or (prior.prefilled_data->>'email',prior.requested_plan,prior.partner_type,prior.equipment_type,prior.existing_partner_id,prior.sales_lead_id,prior.invite_id)
        is distinct from (email_value,plan,kind,equipment,partner_ref,lead_ref,invite_ref)
      then raise exception 'ONBOARDING_SOURCE_CONFLICT'; end if;
    return jsonb_build_object('created',false,'flow',to_jsonb(prior)-'token_hash');
  end if;
  -- Only expired open entries for this email are closed; evidence is retained.
  with expired as (
    update public.partner_onboardings set status='EXPIRED',version=version+1,updated_at=now()
      where orchestration_version=3 and lower(prefilled_data->>'email')=email_value
        and expires_at<=now() and status in ('CREATED','INVITED','STARTED','DATA_INCOMPLETE','DATA_COMPLETE','LEGAL_PENDING','LEGAL_ACCEPTED') returning id
  ) insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
      select p_actor,'partner_onboarding_expired','partner_onboarding',id::text,'{}'::jsonb from expired;
  if exists(select 1 from public.partner_onboardings where orchestration_version=3 and lower(prefilled_data->>'email')=email_value
    and status not in ('ACTIVE','CANCELLED','EXPIRED')) then raise exception 'ONBOARDING_DUPLICATE'; end if;
  insert into public.partner_onboardings(source,requested_plan,partner_type,equipment_type,existing_partner_id,partner_id,
    sales_lead_id,invite_id,prefilled_data,token_hash,expires_at,auth_user_id,identity_verified,orchestration_version,creation_key,created_by)
    values(entry_source,plan,kind,equipment,partner_ref,partner_ref,lead_ref,invite_ref,values_data,p_token_hash,now()+interval '7 days',
      case when own_entry then p_actor end,own_entry,3,request_key,p_actor) returning * into flow;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
    values(p_actor,'partner_onboarding_created','partner_onboarding',flow.id::text,jsonb_build_object('source',entry_source,'plan',plan,'partnerType',kind));
  return jsonb_build_object('created',true,'flow',to_jsonb(flow)-'token_hash');
end $$;

create function public.partner_onboarding_step(p_action text,p_id uuid,p_actor uuid,p_token_hash text default null,p_version bigint default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings; actor_email text; actor_role text; admin_read boolean;
  values_data jsonb; f text; complete boolean; next_status text;
begin
  if p_action is null or p_action not in ('READ','START','SAVE_DATA','CANCEL') then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  select lower(u.email),p.role into actor_email,actor_role from auth.users u join public.portal_users p on p.id=u.id
    where u.id=p_actor and u.email_confirmed_at is not null and p.status='active';
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
revoke all on function public.onboarding_admin_allowed(uuid,text),public.create_partner_onboarding(uuid,jsonb,text),public.partner_onboarding_step(text,uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.create_partner_onboarding(uuid,jsonb,text),public.partner_onboarding_step(text,uuid,uuid,text,bigint,jsonb) to service_role;

create function public.partner_onboarding_invited(p_id uuid,p_actor uuid,p_delivery_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings;
begin
  if p_delivery_reference is null or p_delivery_reference !~ '^[a-zA-Z0-9_.:-]{1,160}$' then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  select * into flow from public.partner_onboardings where id=p_id and orchestration_version=3 for update;
  if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  if flow.created_by is distinct from p_actor or flow.source not in ('ADMIN_INVITE','CRM_IMPORT','SALES_OS')
    or (flow.source='SALES_OS' and p_actor is not null)
    or (flow.source<>'SALES_OS' and not public.onboarding_admin_allowed(p_actor,'partners.write')) then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
  if flow.invitation_delivery_ref=p_delivery_reference then return to_jsonb(flow)-'token_hash'; end if;
  if flow.invitation_delivery_ref is not null then raise exception 'ONBOARDING_NOT_OPEN'; end if;
  -- A recipient may click before the sender receives its acknowledgement.
  -- Record confirmed delivery without rewinding STARTED/LEGAL/terminal states.
  update public.partner_onboardings set invitation_delivery_ref=p_delivery_reference,
    status=case when status='CREATED' and expires_at>now() then 'INVITED' else status end,version=version+1,updated_at=now()
    where id=p_id returning * into flow;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
    values(p_actor,'partner_onboarding_invited','partner_onboarding',p_id::text,jsonb_build_object('source',flow.source,'deliveryReference',p_delivery_reference));
  return to_jsonb(flow)-'token_hash';
end $$;
revoke all on function public.partner_onboarding_invited(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.partner_onboarding_invited(uuid,uuid,text) to service_role;
