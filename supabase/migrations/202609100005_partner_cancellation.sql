create table public.partner_cancellations (
 id uuid primary key default gen_random_uuid(), partner_id text not null unique,
 actor_id uuid not null references public.portal_users(id), source_user_id text not null,
 plan text not null check(plan in ('basic','premium')), requested_at timestamptz not null default now(),
 effective_date date not null, status text not null default 'SCHEDULED' check(status in ('SCHEDULED','ENDED')),
 billing_status text not null check(billing_status in ('NOT_REQUIRED','PENDING','SCHEDULED','WAITING_NEXT_PERIOD','MANUAL_REVIEW')),
 subscription_id text, payment_mode text, onboarding_id text, notice_text text not null,
 ended_at timestamptz, deletion_status text not null default 'AFTER_CONTRACT_END',
 billing_checked_at timestamptz
);
alter table public.partner_cancellations enable row level security;
revoke all on public.partner_cancellations from anon, authenticated;
grant all on public.partner_cancellations to service_role;

create or replace function public.request_partner_cancellation(p_actor uuid,p_revision bigint,p_partner text,p_date date,p_plan text,p_notice text)
returns public.partner_cancellations language plpgsql security definer set search_path=public as $$
declare s public.portal_runtime_state; p jsonb; src text; r public.partner_cancellations; role_value text;
begin
 select role into role_value from public.portal_users where id=p_actor and status='active';
 if role_value is null or role_value not in ('partner_basic','referral_partner','crafts_partner','broker_partner') then raise exception 'CANCELLATION_FORBIDDEN';end if;
 select source_user_id into src from public.identity_imports where auth_user_id=p_actor;
 if src is null then raise exception 'CANCELLATION_FORBIDDEN';end if;
 select * into s from public.portal_runtime_state where id='primary' for update;
 select value into p from jsonb_array_elements(s.payload->'partners') where value->>'id'=p_partner and value->>'userId'=src;
 if p is null then raise exception 'CANCELLATION_FORBIDDEN';end if;
 select * into r from public.partner_cancellations where partner_id=p_partner;
 if found then return r;end if;
 if s.revision<>p_revision then raise exception 'CANCELLATION_CHANGED';end if;
 if exists(select 1 from public.partner_checkout_attempts a join public.partner_onboardings o on o.id=a.onboarding_id where o.existing_partner_id=p_partner and a.status in ('PREPARING','OPEN')) then raise exception 'CHECKOUT_RECONCILIATION_REQUIRED';end if;
 if p_date<(now() at time zone 'Europe/Berlin')::date then raise exception 'CANCELLATION_DATE_INVALID';end if;
 insert into public.partner_cancellations(partner_id,actor_id,source_user_id,plan,effective_date,billing_status,subscription_id,payment_mode,onboarding_id,notice_text)
 values(p_partner,p_actor,src,p_plan,p_date,case when p_plan='basic' then 'NOT_REQUIRED' when p#>>'{license,stripeSubscriptionId}' is not null then 'PENDING' else 'MANUAL_REVIEW' end,
 p#>>'{license,stripeSubscriptionId}',p#>>'{license,paymentMode}',p#>>'{license,onboardingId}',p_notice) returning * into r;
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata) values(p_actor,'partnership.cancellation_requested','partner',p_partner,jsonb_build_object('cancellationId',r.id,'effectiveDate',p_date,'plan',p_plan,'doubleConfirmation',true));
 return r;
end $$;
revoke all on function public.request_partner_cancellation(uuid,bigint,text,date,text,text) from public,anon,authenticated;
grant execute on function public.request_partner_cancellation(uuid,bigint,text,date,text,text) to service_role;

-- End access atomically, retaining owner records. Erasure is a separate,
-- reviewable retention task, never a cascading deletion of customer assets.
create or replace function public.end_due_partner_cancellations() returns integer
language plpgsql security definer set search_path=public as $$
declare r public.partner_cancellations; s public.portal_runtime_state; total integer:=0;
begin
 select * into s from public.portal_runtime_state where id='primary' for update;
 for r in select c.* from public.partner_cancellations c where c.status='SCHEDULED' and c.effective_date<(now() at time zone 'Europe/Berlin')::date and exists(select 1 from public.portal_users u where u.id=c.actor_id and u.role in ('partner_basic','referral_partner','crafts_partner','broker_partner')) for update loop
  s.payload:=jsonb_set(s.payload,'{partners}',(select jsonb_agg(case when x->>'id'=r.partner_id then x||jsonb_build_object('status','contract_ended','contractEndedAt',now()) else x end) from jsonb_array_elements(s.payload->'partners') x));
  update public.portal_users set status='disabled' where id=r.actor_id and role in ('partner_basic','referral_partner','crafts_partner','broker_partner');
  update public.identity_imports set active=false where auth_user_id=r.actor_id and source_user_id=r.source_user_id;
  update public.partner_cancellations set status='ENDED',ended_at=now(),deletion_status='RETENTION_REVIEW_REQUIRED' where id=r.id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata) values(r.actor_id,'partnership.ended_retention_review_required','partner',r.partner_id,jsonb_build_object('cancellationId',r.id,'ownerRecordsPreserved',true));
  total:=total+1;
 end loop;
 if total>0 then update public.portal_runtime_state set payload=s.payload,revision=revision+1 where id='primary';end if;
 return total;
end $$;
revoke all on function public.end_due_partner_cancellations() from public,anon,authenticated;
grant execute on function public.end_due_partner_cancellations() to service_role;

create or replace function public.guard_cancelled_partner_checkout() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.portal_runtime_state where id='primary' for update;
 if exists(select 1 from public.partner_cancellations c join public.partner_onboardings o on o.existing_partner_id=c.partner_id where o.id=new.onboarding_id) then raise exception 'PARTNERSHIP_CANCELLED';end if;
 return new;
end $$;
create trigger cancelled_partner_checkout before insert on public.partner_checkout_attempts for each row execute function public.guard_cancelled_partner_checkout();
