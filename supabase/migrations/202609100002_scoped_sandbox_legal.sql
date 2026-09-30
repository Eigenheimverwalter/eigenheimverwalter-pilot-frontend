-- Additive isolation. No test documents or acceptances are inserted here.
alter table public.partner_onboardings add column sandbox_only boolean not null default false;
alter table public.legal_documents add column sandbox_onboarding_id uuid references public.partner_onboardings(id) on delete restrict;
drop index public.legal_one_active_version;
create unique index legal_one_active_version on public.legal_documents(document_type) where status='ACTIVE' and sandbox_onboarding_id is null;
create unique index legal_one_active_sandbox_version on public.legal_documents(sandbox_onboarding_id,document_type) where status='ACTIVE' and sandbox_onboarding_id is not null;

create function public.guard_sandbox_legal_scope() returns trigger
language plpgsql security definer set search_path=public as $$
declare flow public.partner_onboardings;
begin
  if TG_TABLE_NAME='partner_onboardings' then
    if TG_OP='UPDATE' and new.sandbox_only is distinct from old.sandbox_only then
      raise exception 'SANDBOX_SCOPE_IMMUTABLE';
    end if;
    if new.sandbox_only and (lower(new.prefilled_data->>'email') is distinct from 'basic.heizung@ehv.test'
      or new.partner_type is distinct from 'EQUIPMENT_PARTNER' or new.equipment_type is distinct from 'EQUIP_HEIZUNG') then
      raise exception 'SANDBOX_ACCOUNT_NOT_ALLOWED';
    end if;
  else
    if TG_OP='UPDATE' and new.sandbox_onboarding_id is distinct from old.sandbox_onboarding_id then
      raise exception 'SANDBOX_SCOPE_IMMUTABLE';
    end if;
    if new.sandbox_onboarding_id is not null then
      select * into flow from public.partner_onboardings where id=new.sandbox_onboarding_id;
      if not found or not flow.sandbox_only or new.title not like 'TEST %' then
        raise exception 'SANDBOX_DOCUMENT_NOT_ALLOWED';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger sandbox_onboarding_scope before insert or update on public.partner_onboardings for each row execute function public.guard_sandbox_legal_scope();
create trigger sandbox_document_scope before insert or update on public.legal_documents for each row execute function public.guard_sandbox_legal_scope();

-- Keep the existing RPCs, locks, evidence and authorisation; only scope selection.
do $$
declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text)'::regprocedure);
  changed:=replace(definition,'where document_type=kind and status=''ACTIVE''',
    'where document_type=kind and status=''ACTIVE'' and ((flow.sandbox_only and sandbox_onboarding_id=flow.id) or (not flow.sandbox_only and sandbox_onboarding_id is null))');
  if changed=definition then raise exception 'LEGAL_SCOPE_PATCH_NOT_APPLIED'; end if;
  execute changed;
  definition:=pg_get_functiondef('public.change_legal_document(text,uuid,uuid,bigint,jsonb)'::regprocedure);
  changed:=replace(definition,'where document_type=kind and status=''ACTIVE''',
    'where document_type=kind and status=''ACTIVE'' and sandbox_onboarding_id is not distinct from doc.sandbox_onboarding_id');
  if changed=definition then raise exception 'LEGAL_ACTIVATION_SCOPE_PATCH_NOT_APPLIED'; end if;
  execute changed;
  definition:=pg_get_functiondef('public.protect_legal_acceptance()'::regprocedure);
  changed:=replace(definition,'new.document_type:=doc.document_type;',
    'if (flow.sandbox_only and doc.sandbox_onboarding_id is distinct from flow.id) or (not flow.sandbox_only and doc.sandbox_onboarding_id is not null) then raise exception ''LEGAL_SCOPE_MISMATCH''; end if; new.document_type:=doc.document_type;');
  if changed=definition then raise exception 'LEGAL_EVIDENCE_SCOPE_PATCH_NOT_APPLIED'; end if;
  execute changed;
end $$;
revoke all on function public.guard_sandbox_legal_scope() from public,anon,authenticated;
