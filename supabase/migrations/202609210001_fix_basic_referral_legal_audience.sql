-- Keep the database contract selection aligned with the application domain:
-- Basic Tippgeber have their own legal audience and must receive the matching
-- price/conditions document during registration.
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

do $$
begin
  if public.legal_audience_for('BASIC','REFERRAL') is distinct from 'BASIC_REFERRAL'
    or not public.legal_document_matches('PRICE_SHEET','BASIC_REFERRAL','BASIC','REFERRAL')
    or public.legal_document_matches('PRICE_SHEET','BASIC','BASIC','REFERRAL') then
    raise exception 'BASIC_REFERRAL_LEGAL_AUDIENCE_REPAIR_FAILED';
  end if;
end $$;
