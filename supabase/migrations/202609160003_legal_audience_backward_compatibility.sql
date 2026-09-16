-- Older trusted clients omitted the audience for common legal documents.
-- Keep that format valid while all new portal uploads provide an explicit target.
do $$declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.change_legal_document(text,uuid,uuid,bigint,jsonb)'::regprocedure);
  changed:=replace(definition,
    $old$if coalesce(p_data->>'audience','') not in ('COMMON','BASIC','BASIC_REFERRAL','PREMIUM_EQUIPMENT','PREMIUM_BROKER') then$old$,
    $new$if coalesce(p_data->>'audience','')='' and p_data->>'document_type'<>'PRICE_SHEET' then
   p_data:=jsonb_set(p_data,'{audience}','"COMMON"');
 end if;
 if coalesce(p_data->>'audience','') not in ('COMMON','BASIC','BASIC_REFERRAL','PREMIUM_EQUIPMENT','PREMIUM_BROKER') then$new$);
  if changed=definition then raise exception 'LEGAL_AUDIENCE_COMPATIBILITY_PATCH_FAILED';end if;
  execute changed;
end $$;
