-- Every partner registration must include an applicable price/conditions
-- document. The accepted document row is immutable and retains its private
-- PDF, version, SHA-256 hash, acceptance text and server timestamp.
do $$declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text)'::regprocedure);
  changed:=replace(definition,
    $old$select array_agg(distinct t order by t) into required_types from (
  select unnest(flow.required_document_types) t union
  select document_type from public.legal_documents where document_type in ('PRICE_SHEET','CONDITIONS') and status='ACTIVE' and effective_from<=now() and deletion_requested_at is null
   and public.legal_document_matches(document_type,audience,flow.requested_plan,flow.partner_type)
   and ((flow.sandbox_only and sandbox_onboarding_id=flow.id) or (not flow.sandbox_only and sandbox_onboarding_id is null))
 ) required;$old$,
    $new$select array_agg(distinct t order by t) into required_types from (
  select unnest(flow.required_document_types) t union
  select document_type from public.legal_documents where document_type in ('PRICE_SHEET','CONDITIONS') and status='ACTIVE' and effective_from<=now() and deletion_requested_at is null
   and public.legal_document_matches(document_type,audience,flow.requested_plan,flow.partner_type)
   and ((flow.sandbox_only and sandbox_onboarding_id=flow.id) or (not flow.sandbox_only and sandbox_onboarding_id is null))
 ) required;
 if not exists (
  select 1 from public.legal_documents where document_type in ('PRICE_SHEET','CONDITIONS') and status='ACTIVE'
   and effective_from<=now() and deletion_requested_at is null
   and public.legal_document_matches(document_type,audience,flow.requested_plan,flow.partner_type)
   and ((flow.sandbox_only and sandbox_onboarding_id=flow.id) or (not flow.sandbox_only and sandbox_onboarding_id is null))
 ) then
  if p_action='ACCEPT' then raise exception 'LEGAL_DOCUMENTS_UNAVAILABLE'; end if;
  missing_types:=missing_types||to_jsonb('PRICE_OR_CONDITIONS'::text); accepted_all:=false;
 end if;$new$);
  if changed=definition then raise exception 'MANDATORY_COMMERCIAL_LEGAL_PATCH_FAILED';end if;
  execute changed;
end $$;
