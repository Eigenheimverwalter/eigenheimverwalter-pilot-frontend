-- Repair installations whose already-migrated partner_legal_step retained the
-- former direct audience comparison in one of its commercial-document gates.
do $$
declare
  definition text;
  changed text;
begin
  definition:=pg_get_functiondef('public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text)'::regprocedure);
  changed:=replace(
    definition,
    'audience=public.legal_audience_for(flow.requested_plan,flow.partner_type)',
    'public.legal_document_matches(document_type,audience,flow.requested_plan,flow.partner_type)'
  );

  if position('audience=public.legal_audience_for(flow.requested_plan,flow.partner_type)' in changed)>0
    or position('public.legal_document_matches(document_type,audience,flow.requested_plan,flow.partner_type)' in changed)=0 then
    raise exception 'PARTNER_LEGAL_STEP_AUDIENCE_REPAIR_FAILED';
  end if;

  if changed is distinct from definition then execute changed; end if;
end $$;
