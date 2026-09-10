-- Self-service is an entry adapter, not a second onboarding or partner table.
-- Only short-lived, hashed mail throttles are new. No raw email, IP or token.
create table public.partner_onboarding_mail_limits (
  bucket text primary key,
  window_started timestamptz not null,
  last_attempt timestamptz not null,
  attempts integer not null check(attempts > 0)
);
alter table public.partner_onboarding_mail_limits enable row level security;
revoke all on public.partner_onboarding_mail_limits from public,anon,authenticated;

-- Supabase generates a random initial password for new magic-link identities.
-- A nonempty encrypted_password is therefore NOT proof of a chosen password.
alter table public.portal_users add column onboarding_password_required boolean not null default false;
create function public.partner_onboarding_password_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.email_confirmed_at is not null and coalesce(new.encrypted_password,'')<>''
    and old.encrypted_password is distinct from new.encrypted_password then
    update public.portal_users set onboarding_password_required=false
      where id=new.id and role='partner_basic' and status='invited' and onboarding_password_required;
  end if;
  return new;
end $$;
create trigger partner_onboarding_password_changed after update of encrypted_password on auth.users
  for each row execute function public.partner_onboarding_password_changed();
revoke all on function public.partner_onboarding_password_changed() from public,anon,authenticated;

create function public.partner_onboarding_email_request(p_email text,p_email_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
declare quota public.partner_onboarding_mail_limits; item text; maximum integer;
begin
  if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$'
    then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-onboarding:email',0));
  delete from public.partner_onboarding_mail_limits where last_attempt<now()-interval '24 hours';
  foreach item in array array['global',p_email_hash] loop
    maximum:=case when item='global' then 100 else 3 end;
    select * into quota from public.partner_onboarding_mail_limits where bucket=item for update;
    if found and quota.window_started>now()-interval '1 hour' and
      (quota.attempts>=maximum or (item<>'global' and quota.last_attempt>now()-interval '1 minute'))
      then return false; end if;
  end loop;
  foreach item in array array['global',p_email_hash] loop
    insert into public.partner_onboarding_mail_limits values(item,now(),now(),1)
      on conflict(bucket) do update set
        attempts=case when partner_onboarding_mail_limits.window_started<=now()-interval '1 hour' then 1 else partner_onboarding_mail_limits.attempts+1 end,
        window_started=case when partner_onboarding_mail_limits.window_started<=now()-interval '1 hour' then now() else partner_onboarding_mail_limits.window_started end,
        last_attempt=now();
  end loop;
  -- Imported/active/disabled identities use their existing login. In particular
  -- do not trigger the legacy import-to-active Auth insert trigger for them.
  if exists(select 1 from public.identity_imports where lower(btrim(email))=p_email)
    or exists(select 1 from auth.users u join public.portal_users p on p.id=u.id
      where lower(u.email)=p_email and not(p.status='invited' and p.role='partner_basic'))
    then return false; end if;
  return true;
end $$;

create function public.partner_onboarding_self_session(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare account_email text; needs_password boolean; actor_role text; actor_status text;
  flow public.partner_onboardings;
begin
  select lower(email),coalesce(encrypted_password,'')='' into account_email,needs_password
    from auth.users where id=p_actor and email_confirmed_at is not null;
  if account_email is null then raise exception 'ONBOARDING_IDENTITY_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-onboarding:create',0));
  select role,status,onboarding_password_required or needs_password into actor_role,actor_status,needs_password from public.portal_users where id=p_actor for update;
  if found then
    if actor_role<>'partner_basic' or actor_status<>'invited' then raise exception 'ONBOARDING_LOGIN_REQUIRED'; end if;
  else
    if exists(select 1 from public.identity_imports where auth_user_id=p_actor or lower(btrim(email))=account_email)
      then raise exception 'ONBOARDING_PERMISSION_DENIED'; end if;
    needs_password:=true;
    insert into public.portal_users(id,display_name,role,status,onboarding_password_required) values(p_actor,'','partner_basic','invited',true);
    insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
      values(p_actor,'partner_onboarding_identity_prepared','portal_user',p_actor::text,'{"access":"onboarding_only","entry":"self_service"}');
  end if;
  select * into flow from public.partner_onboardings where orchestration_version=3
    and lower(prefilled_data->>'email')=account_email and status not in ('ACTIVE','CANCELLED','EXPIRED')
    and expires_at>now() order by created_at desc limit 1;
  if found and flow.auth_user_id is distinct from p_actor then raise exception 'ONBOARDING_INVITATION_REQUIRED'; end if;
  return jsonb_build_object('email',account_email,'needs_password',needs_password,
    'onboarding_id',flow.id);
end $$;

-- Minimal, asserted change to the central create function; do not fork its
-- validation/idempotency/ownership rules. All other entry sources are unchanged.
do $$
declare definition text; old_clause text:='u.email_confirmed_at is not null and p.status=''active'';';
begin
  definition:=pg_get_functiondef('public.create_partner_onboarding(uuid,jsonb,text)'::regprocedure);
  if position(old_clause in definition)=0 then raise exception 'Self-service migration: central create guard changed; review required'; end if;
  definition:=replace(definition,old_clause,
    'u.email_confirmed_at is not null and (p.status=''active'' or (own_entry and p.status=''invited'' and p.role=''partner_basic'' and not p.onboarding_password_required and coalesce(u.encrypted_password,'''')<>''''));');
  execute definition;
end $$;

revoke all on function public.partner_onboarding_email_request(text,text) from public,anon,authenticated;
revoke all on function public.partner_onboarding_self_session(uuid) from public,anon,authenticated;
grant execute on function public.partner_onboarding_email_request(text,text) to service_role;
grant execute on function public.partner_onboarding_self_session(uuid) to service_role;
