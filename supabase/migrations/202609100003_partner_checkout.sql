-- Additive sandbox checkout. Existing identities and production licences stay intact.
create table public.partner_checkout_attempts (
  id uuid primary key,
  onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  status text not null check(status in ('PREPARING','OPEN','PAID','EXPIRED')),
  postal_codes jsonb not null check(jsonb_typeof(postal_codes)='array' and jsonb_array_length(postal_codes) between 2 and 10),
  quote jsonb not null,
  stripe_expires_at bigint not null,
  checkout_id text unique,
  checkout_url text,
  subscription_id text unique,
  paid_through bigint,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index partner_checkout_open on public.partner_checkout_attempts(onboarding_id) where status in ('PREPARING','OPEN','PAID');
create table public.partner_payment_events (
  event_id text primary key,
  attempt_id uuid not null references public.partner_checkout_attempts(id) on delete restrict,
  event_type text not null,
  created_at timestamptz not null default now()
);
alter table public.partner_checkout_attempts enable row level security;
alter table public.partner_payment_events enable row level security;
revoke all on public.partner_checkout_attempts,public.partner_payment_events from anon,authenticated;
grant all on public.partner_checkout_attempts,public.partner_payment_events to service_role;

-- Only encrypted signing material; encryption key remains in Edge secrets.
create table public.partner_stripe_configuration (
  id text primary key check(id='sandbox'),
  endpoint_id text not null,
  encrypted_secret jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.partner_stripe_configuration enable row level security;
revoke all on public.partner_stripe_configuration from anon,authenticated;
grant all on public.partner_stripe_configuration to service_role;

-- Set isolation at creation, not afterwards. Only the designated existing test
-- identity can receive scoped test documents. No production flow is modified.
do $$
declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.create_partner_onboarding(uuid,jsonb,text)'::regprocedure);
  changed:=replace(definition,'orchestration_version,creation_key,created_by)', 'orchestration_version,creation_key,created_by,sandbox_only)');
  changed:=replace(changed,'own_entry,3,request_key,p_actor)',
    'own_entry,3,request_key,p_actor,(own_entry and email_value=''basic.heizung@ehv.test'' and kind=''EQUIPMENT_PARTNER'' and equipment=''EQUIP_HEIZUNG'' and partner_ref is not null))');
  if changed=definition or position('created_by,sandbox_only)' in changed)=0 then raise exception 'SANDBOX_CREATION_PATCH_FAILED'; end if;
  execute changed;
end $$;

-- Trusted Edge adapter computes a candidate using the SAME region reservation
-- service as manual licences. CAS commits runtime, checkout, flow and audit in
-- one transaction; no partial reservation or partial activation is possible.
create function public.commit_partner_checkout(p_action text,p_flow uuid,p_actor uuid,p_flow_version bigint,
  p_revision bigint,p_payload jsonb,p_attempt jsonb,p_event text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings; attempt public.partner_checkout_attempts; legal jsonb;
  selected_attempt_id uuid:=(p_attempt->>'id')::uuid; next_state text; target_partner jsonb; codes jsonb; n integer;
begin
  if p_action not in ('PREPARE','OPEN','PAID','EXPIRED') then raise exception 'CHECKOUT_ACTION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_flow::text,0));
  select * into attempt from public.partner_checkout_attempts where id=selected_attempt_id;
  if attempt.id is not null and attempt.onboarding_id<>p_flow then raise exception 'CHECKOUT_IDENTITY_MISMATCH'; end if;
  if p_event is not null and exists(select 1 from public.partner_payment_events e where e.event_id=p_event and e.attempt_id=selected_attempt_id) then return to_jsonb(attempt); end if;
  if p_action='PAID' and attempt.status='PAID' then return to_jsonb(attempt); end if;
  -- Reuse legal RPC and its document/flow lock order, including current versions.
  if p_action in ('PREPARE','PAID') then
    legal:=public.partner_legal_step('READ',p_flow,p_actor);
    if legal->>'accepted' is distinct from 'true' or legal->>'dataComplete' is distinct from 'true' then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
  end if;
  select * into flow from public.partner_onboardings where id=p_flow for update;
  if not found or flow.auth_user_id is distinct from p_actor or not flow.identity_verified
    or not flow.sandbox_only or flow.prefilled_data->>'email'<>'basic.heizung@ehv.test'
    or flow.requested_plan<>'PREMIUM' or flow.existing_partner_id is null then raise exception 'CHECKOUT_IDENTITY_MISMATCH'; end if;
  if flow.version<>p_flow_version then raise exception 'ONBOARDING_CHANGED'; end if;
  if flow.status in ('ACTIVE','CANCELLED','EXPIRED') then raise exception 'ONBOARDING_NOT_OPEN'; end if;
  codes:=p_attempt->'postal_codes';
  if p_action='PREPARE' then
    if attempt.id is not null then raise exception 'CHECKOUT_ALREADY_EXISTS'; end if;
    if flow.status<>'LEGAL_ACCEPTED' then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
    n:=jsonb_array_length(codes);
    if n not between 2 and 10 or (select count(distinct c) from jsonb_array_elements_text(codes) c)<>n
      or exists(select 1 from jsonb_array_elements_text(codes) c where c !~ '^[0-9]{5}$') then raise exception 'POSTAL_CODE_SELECTION_INVALID'; end if;
    insert into public.partner_checkout_attempts(id,onboarding_id,status,postal_codes,quote,stripe_expires_at)
      values(selected_attempt_id,p_flow,'PREPARING',codes,p_attempt->'quote',(p_attempt->>'stripe_expires_at')::bigint) returning * into attempt;
    next_state:='CHECKOUT_PENDING';
  else
    if attempt.id is null or attempt.version<>(p_attempt->>'version')::bigint then raise exception 'CHECKOUT_CHANGED'; end if;
    if p_action='OPEN' then
      if attempt.status<>'PREPARING' or p_attempt->>'checkout_id' not like 'cs_test_%'
        or p_attempt->>'checkout_url' not like 'https://checkout.stripe.com/%' then raise exception 'CHECKOUT_SESSION_INVALID'; end if;
      update public.partner_checkout_attempts set status='OPEN',checkout_id=p_attempt->>'checkout_id',checkout_url=p_attempt->>'checkout_url',version=version+1,updated_at=now()
        where id=selected_attempt_id returning * into attempt;
      next_state:='PAYMENT_PENDING';
    elsif p_action='EXPIRED' then
      if attempt.status<>'OPEN' or p_event is null then raise exception 'CHECKOUT_RECONCILIATION_REQUIRED'; end if;
      update public.partner_checkout_attempts set status='EXPIRED',checkout_url=null,version=version+1,updated_at=now() where id=selected_attempt_id returning * into attempt;
      next_state:='LEGAL_ACCEPTED';
    else
      if attempt.status<>'OPEN' or p_event is null or p_event not like 'evt_%' or nullif(p_attempt->>'subscription_id','') is null
        or (p_attempt->>'paid_through')::bigint<=extract(epoch from now()) then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;
      select p into target_partner from jsonb_array_elements(p_payload->'partners') p where p->>'id'=flow.existing_partner_id;
      if target_partner is null or target_partner->>'plan'<>'premium' or target_partner->>'status'<>'active'
        or target_partner->'license'->>'stripeSubscriptionId' is distinct from p_attempt->>'subscription_id'
        or target_partner->'postalCodes' is distinct from attempt.postal_codes then raise exception 'LICENSE_REQUIRED'; end if;
      update public.partner_checkout_attempts set status='PAID',subscription_id=p_attempt->>'subscription_id',paid_through=(p_attempt->>'paid_through')::bigint,
        checkout_url=null,version=version+1,updated_at=now() where id=selected_attempt_id returning * into attempt;
      next_state:='ACTIVE';
    end if;
  end if;
  perform public.replace_portal_runtime_state(p_revision,p_payload,p_actor,'partner_checkout_'||lower(p_action),'partner_onboarding',p_flow::text,
    jsonb_build_object('attemptId',selected_attempt_id,'sandbox',true));
  update public.partner_onboardings set status=next_state,version=version+1,updated_at=now() where id=p_flow;
  if p_event is not null then insert into public.partner_payment_events(event_id,attempt_id,event_type) values(p_event,selected_attempt_id,p_action); end if;
  return to_jsonb(attempt);
end $$;
revoke all on function public.commit_partner_checkout(text,uuid,uuid,bigint,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.commit_partner_checkout(text,uuid,uuid,bigint,bigint,jsonb,jsonb,text) to service_role;
