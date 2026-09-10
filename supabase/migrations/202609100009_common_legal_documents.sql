-- Only price sheets have a commercial audience. Existing evidence is immutable.
alter table public.legal_documents drop constraint legal_documents_audience_check;
alter table public.legal_documents add constraint legal_documents_audience_check check(audience in ('LEGACY','COMMON','BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER'));
create function public.legal_document_matches(kind text,audience text,plan text,partner_kind text) returns boolean language sql immutable as $$
 select case when kind='PRICE_SHEET' then audience=public.legal_audience_for(plan,partner_kind) else audience='COMMON' end;
$$;
do $$declare definition text; changed text;
begin
 definition:=pg_get_functiondef('public.change_legal_document(text,uuid,uuid,bigint,jsonb)'::regprocedure);
 changed:=replace(definition,$s$if coalesce(p_data->>'audience','') not in ('BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER') then$s$,$p$if p_data->>'document_type'<>'PRICE_SHEET' then p_data:=jsonb_set(p_data,'{audience}','"COMMON"');end if;
 if (p_data->>'document_type'='PRICE_SHEET' and coalesce(p_data->>'audience','') not in ('BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER')) then$p$);
 changed:=replace(changed,'values(kind,1)','values(kind,(select coalesce(max(version),0)+1 from public.legal_documents where document_type=kind))');
 changed:=replace(changed,'last_version=legal_document_versions.last_version+1','last_version=greatest(legal_document_versions.last_version,(select coalesce(max(version),0) from public.legal_documents where document_type=kind))+1');
 if changed=definition or position('greatest(legal_document_versions.last_version' in changed)=0 then raise exception 'COMMON_LEGAL_UPLOAD_PATCH_FAILED';end if;execute changed;
 definition:=pg_get_functiondef('public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text)'::regprocedure);
 changed:=replace(definition,'audience=public.legal_audience_for(flow.requested_plan,flow.partner_type)','public.legal_document_matches(document_type,audience,flow.requested_plan,flow.partner_type)');
 if changed=definition then raise exception 'COMMON_LEGAL_STEP_PATCH_FAILED';end if;execute changed;
 definition:=pg_get_functiondef('public.protect_legal_acceptance()'::regprocedure);
 changed:=replace(definition,'doc.audience is distinct from public.legal_audience_for(flow.requested_plan,flow.partner_type)','not public.legal_document_matches(doc.document_type,doc.audience,flow.requested_plan,flow.partner_type)');
 if changed=definition then raise exception 'COMMON_LEGAL_ACCEPTANCE_PATCH_FAILED';end if;execute changed;
end $$;
-- Do not guess which previously scoped contract should become the common one.
-- Administrators upload/approve one common version; historical acceptances survive.
