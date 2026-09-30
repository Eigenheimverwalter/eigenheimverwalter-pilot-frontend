-- One-time, explicitly scoped production repair for the Kehlfinanz onboarding.
-- Abort without changing anything if identity, plan, role or legal evidence no
-- longer match the diagnosed state.
do $$
declare
  flow public.partner_onboardings;
  runtime public.portal_runtime_state;
  partner_ref text;
  partner_count integer;
  next_partners jsonb;
begin
  select * into flow from public.partner_onboardings
    where id='8f35e291-dcd2-4461-8716-4aed31a816f3'::uuid for update;
  if not found or flow.auth_user_id is distinct from 'd2f82119-ebd9-4836-8c09-a250c1af6419'::uuid
    or flow.status<>'LEGAL_ACCEPTED' or flow.requested_plan<>'BASIC'
    or flow.partner_type<>'REFERRAL' or not flow.identity_verified
    or lower(flow.prefilled_data->>'email')<>'kristin.gleich@kehlfinanz.de'
  then raise exception 'KEHLFINANZ_ACTIVATION_STATE_CHANGED'; end if;
  partner_ref:=coalesce(flow.partner_id,flow.existing_partner_id);
  if partner_ref is distinct from 'sales-basic-85beb4b7-5ac4-4743-96fc-7b07ce431153'
  then raise exception 'KEHLFINANZ_PARTNER_CHANGED'; end if;

  if exists (
    select 1 from public.legal_documents d
    where public.legal_document_matches(d.document_type,d.audience,flow.requested_plan,flow.partner_type)
      and d.status='ACTIVE' and d.effective_from<=now()
      and d.deletion_requested_at is null and d.sandbox_onboarding_id is null
      and d.document_type in ('TERMS','PRIVACY','PRICE_SHEET','CONDITIONS')
      and not exists (
        select 1 from public.legal_acceptances a
        where a.onboarding_id=flow.id and a.legal_document_id=d.id
          and a.document_version=d.version
          and a.accepted_by_email=lower(flow.prefilled_data->>'email')
      )
  ) then raise exception 'KEHLFINANZ_LEGAL_EVIDENCE_INCOMPLETE'; end if;

  select * into runtime from public.portal_runtime_state where id='primary' for update;
  select count(*) into partner_count
    from jsonb_array_elements(coalesce(runtime.payload->'partners','[]'::jsonb)) p
    where p->>'id'=partner_ref and lower(btrim(p->>'email'))='kristin.gleich@kehlfinanz.de'
      and coalesce((p->>'referralOnly')::boolean,false);
  if partner_count<>1 then raise exception 'KEHLFINANZ_RUNTIME_PARTNER_CHANGED'; end if;
  select jsonb_agg(case when p->>'id'=partner_ref then
      p||jsonb_build_object('status','active','plan','basic','cooperationLevel','BASIC')
    else p end order by ord)
    into next_partners
    from jsonb_array_elements(coalesce(runtime.payload->'partners','[]'::jsonb))
      with ordinality as x(p,ord);

  update public.portal_runtime_state
    set payload=jsonb_set(payload,'{partners}',next_partners,false),revision=revision+1,updated_at=now()
    where id='primary' and revision=runtime.revision;
  update public.portal_users set status='active',updated_at=now()
    where id=flow.auth_user_id and role='partner_basic' and status='invited';
  if not found then raise exception 'KEHLFINANZ_PROFILE_CHANGED'; end if;
  update public.partner_onboardings set status='ACTIVE',version=version+1,updated_at=now()
    where id=flow.id and status='LEGAL_ACCEPTED';
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
    values(flow.auth_user_id,'partner_basic_activated','partner_onboarding',flow.id::text,
      jsonb_build_object('partnerId',partner_ref,'partnerType','REFERRAL','repair','kehlfinanz'));
end $$;
