-- Receipt for the EXISTING SalesOS outbox. This is not a second scheduler/queue.
alter table public.partner_onboardings add column if not exists invitation_attempted_at timestamptz;
alter table public.partner_onboardings add column if not exists invitation_sent_at timestamptz;
alter table public.partner_onboardings add column if not exists invitation_delivery_status text
  check(invitation_delivery_status in ('sending','sent','uncertain'));

create or replace function public.sales_onboarding_delivery(p_id uuid,p_job_id text,p_token_hash text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare flow public.partner_onboardings; claimed boolean:=false;
begin
 if p_action not in ('CLAIM','SENT','UNCERTAIN') then raise exception 'ONBOARDING_INPUT_INVALID'; end if;
 select * into flow from public.partner_onboardings where id=p_id and source='SALES_OS'
   and invite_id=p_job_id and token_hash=p_token_hash and orchestration_version>=3 for update;
 if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
 if p_action='CLAIM' and flow.invitation_attempted_at is null then
   if flow.status<>'CREATED' or flow.expires_at<=now() then raise exception 'ONBOARDING_NOT_OPEN'; end if;
   update public.partner_onboardings set invitation_attempted_at=now(),invitation_delivery_status='sending'
     where id=p_id returning * into flow;
   claimed:=true;
 elsif p_action in ('SENT','UNCERTAIN') then
   if flow.invitation_attempted_at is null then raise exception 'ONBOARDING_NOT_OPEN'; end if;
   -- A late/duplicate uncertain result cannot overwrite a confirmed send.
   if flow.invitation_delivery_status<>'sent' then
     update public.partner_onboardings set invitation_delivery_status=case when p_action='SENT' then 'sent' else 'uncertain' end,
       invitation_sent_at=case when p_action='SENT' then now() else null end where id=p_id returning * into flow;
   end if;
 end if;
 return jsonb_build_object('claimed',claimed,'status',case when flow.invitation_delivery_status='sending' then 'uncertain' else flow.invitation_delivery_status end,
   'sentAt',flow.invitation_sent_at);
end;$$;
revoke all on function public.sales_onboarding_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sales_onboarding_delivery(uuid,text,text,text) to service_role;
