-- One uploaded document may be published independently for each partner role.
alter table public.legal_documents drop constraint if exists legal_documents_audience_check;
alter table public.legal_documents add constraint legal_documents_audience_check
  check(audience in ('LEGACY','COMMON','BASIC','BASIC_REFERRAL','PREMIUM_EQUIPMENT','PREMIUM_BROKER'));

create or replace function public.legal_audience_for(plan text,kind text) returns text
language sql immutable as $$
  select case
    when upper(coalesce(plan,''))='BASIC' and upper(coalesce(kind,''))='REFERRAL' then 'BASIC_REFERRAL'
    when upper(coalesce(plan,''))='BASIC' then 'BASIC'
    when upper(coalesce(kind,''))='BROKER_PARTNER' then 'PREMIUM_BROKER'
    when upper(coalesce(kind,''))='EQUIPMENT_PARTNER' then 'PREMIUM_EQUIPMENT'
    else null
  end;
$$;

create or replace function public.legal_document_matches(kind text,audience text,plan text,partner_kind text) returns boolean
language sql immutable as $$
  select audience='COMMON' or audience=public.legal_audience_for(plan,partner_kind);
$$;

do $$declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.change_legal_document(text,uuid,uuid,bigint,jsonb)'::regprocedure);
  changed:=replace(definition,
    $old$if p_data->>'document_type'<>'PRICE_SHEET' then p_data:=jsonb_set(p_data,'{audience}','"COMMON"');end if;
 if (p_data->>'document_type'='PRICE_SHEET' and coalesce(p_data->>'audience','') not in ('BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER')) then$old$,
    $new$if coalesce(p_data->>'audience','') not in ('COMMON','BASIC','BASIC_REFERRAL','PREMIUM_EQUIPMENT','PREMIUM_BROKER') then$new$);
  if changed=definition then raise exception 'FLEXIBLE_LEGAL_AUDIENCE_PATCH_FAILED';end if;
  execute changed;
end $$;
