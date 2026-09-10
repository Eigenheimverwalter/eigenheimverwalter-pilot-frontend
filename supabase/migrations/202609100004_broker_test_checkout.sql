-- Extend only the user-authorized broker sandbox; no production rollout.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('public.create_partner_onboarding(uuid,jsonb,text)'::regprocedure) into definition;
  changed:=replace(definition,
    'email_value=''basic.heizung@ehv.test'' and kind=''EQUIPMENT_PARTNER'' and equipment=''EQUIP_HEIZUNG''',
    '((email_value=''basic.heizung@ehv.test'' and kind=''EQUIPMENT_PARTNER'' and equipment=''EQUIP_HEIZUNG'') or (email_value=''makler_basic@ehv.test'' and kind=''BROKER_PARTNER'' and equipment is null))');
  if changed=definition then raise exception 'BROKER_SANDBOX_CREATION_PATCH_FAILED'; end if;
  execute changed;
  select pg_get_functiondef('public.commit_partner_checkout(text,uuid,uuid,bigint,bigint,jsonb,jsonb,text)'::regprocedure) into definition;
  changed:=replace(definition,'flow.prefilled_data->>''email''<>''basic.heizung@ehv.test''',
    '(flow.prefilled_data->>''email'') not in (''basic.heizung@ehv.test'',''makler_basic@ehv.test'')');
  if changed=definition then raise exception 'BROKER_SANDBOX_CHECKOUT_PATCH_FAILED'; end if;
  execute changed;
end $$;

create or replace function public.guard_sandbox_legal_scope() returns trigger
language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings;
begin
  if TG_TABLE_NAME='partner_onboardings' then
    if TG_OP='UPDATE' and new.sandbox_only is distinct from old.sandbox_only then raise exception 'SANDBOX_SCOPE_IMMUTABLE'; end if;
    if new.sandbox_only and not coalesce(
      (lower(new.prefilled_data->>'email')='basic.heizung@ehv.test' and new.partner_type='EQUIPMENT_PARTNER' and new.equipment_type='EQUIP_HEIZUNG')
      or (lower(new.prefilled_data->>'email')='makler_basic@ehv.test' and new.partner_type='BROKER_PARTNER' and new.equipment_type is null),false)
      then raise exception 'SANDBOX_ACCOUNT_NOT_ALLOWED'; end if;
  else
    if TG_OP='UPDATE' and new.sandbox_onboarding_id is distinct from old.sandbox_onboarding_id then raise exception 'SANDBOX_SCOPE_IMMUTABLE'; end if;
    if new.sandbox_onboarding_id is not null then
      select * into flow from public.partner_onboardings where id=new.sandbox_onboarding_id;
      if not found or not flow.sandbox_only or new.title not like 'TEST %' then raise exception 'SANDBOX_DOCUMENT_NOT_ALLOWED'; end if;
    end if;
  end if;
  return new;
end $$;
