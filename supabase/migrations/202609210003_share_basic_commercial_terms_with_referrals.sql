-- The business owner confirmed that Basic partners and Basic Tippgeber use the
-- same commercial price/conditions document. Keep all other legal audiences
-- isolated and continue preferring a dedicated BASIC_REFERRAL document if one
-- is published later.
create or replace function public.legal_document_matches(kind text,audience text,plan text,partner_kind text) returns boolean
language sql immutable as $$
  select audience='COMMON'
    or audience=public.legal_audience_for(plan,partner_kind)
    or (upper(coalesce(plan,''))='BASIC'
      and upper(coalesce(partner_kind,''))='REFERRAL'
      and audience='BASIC'
      and kind in ('PRICE_SHEET','CONDITIONS'));
$$;

do $$
begin
  if not public.legal_document_matches('PRICE_SHEET','BASIC','BASIC','REFERRAL')
    or public.legal_document_matches('TERMS','BASIC','BASIC','REFERRAL') then
    raise exception 'BASIC_REFERRAL_COMMERCIAL_SHARING_FAILED';
  end if;
end $$;
