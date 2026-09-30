-- Old evidence is retained without guessing a contractual audience.
alter table public.legal_documents add column audience text not null default 'LEGACY'
 check(audience in ('LEGACY','BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER'));
drop index public.legal_one_active_version;
drop index public.legal_one_active_sandbox_version;
create unique index legal_one_active_version on public.legal_documents(document_type,audience) where status='ACTIVE' and sandbox_onboarding_id is null;
create unique index legal_one_active_sandbox_version on public.legal_documents(sandbox_onboarding_id,document_type,audience) where status='ACTIVE' and sandbox_onboarding_id is not null;

create function public.legal_audience_for(plan text,kind text) returns text language sql immutable as $$
 select case when plan='BASIC' then 'BASIC' when plan='PREMIUM' and kind='EQUIPMENT_PARTNER' then 'PREMIUM_EQUIPMENT' when plan='PREMIUM' and kind='BROKER_PARTNER' then 'PREMIUM_BROKER' else null end;
$$;
create function public.legal_audience_immutable() returns trigger language plpgsql as $$
begin if new.audience is distinct from old.audience then raise exception 'LEGAL_AUDIENCE_IMMUTABLE';end if;return new;end $$;
create trigger legal_audience_immutable before update on public.legal_documents for each row execute function public.legal_audience_immutable();

create function public.assert_legal_partner_kind(partner_ref text,plan text,kind text) returns void language plpgsql security definer set search_path=public as $$
declare partner jsonb;
begin
 if partner_ref is null or plan<>'PREMIUM' then return;end if;
 select p into partner from public.portal_runtime_state s,lateral jsonb_array_elements(s.payload->'partners') p where s.id='primary' and p->>'id'=partner_ref;
 if partner is null or coalesce((partner->>'referralOnly')::boolean,false) or
 (partner->>'primaryTradeId'='BROKER' and kind<>'BROKER_PARTNER') or
 (partner->>'primaryTradeId' is distinct from 'BROKER' and kind<>'EQUIPMENT_PARTNER') then raise exception 'LEGAL_AUDIENCE_MISMATCH';end if;
end $$;
revoke all on function public.assert_legal_partner_kind(text,text,text) from public,anon,authenticated;

do $$declare definition text; changed text;
begin
 definition:=pg_get_functiondef('public.change_legal_document(text,uuid,uuid,bigint,jsonb)'::regprocedure);
 changed:=replace(definition,$s$if p_action='UPLOAD' then kind:=p_data->>'document_type';$s$,$p$if p_action='UPLOAD' then
 if coalesce(p_data->>'audience','') not in ('BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER') then raise exception 'LEGAL_AUDIENCE_REQUIRED';end if;
 kind:=p_data->>'document_type';$p$);
 changed:=replace(changed,'version,acceptance_text,uploaded_by)','version,acceptance_text,uploaded_by,audience)');
 changed:=replace(changed,$s$next_version,p_data->>'acceptance_text',p_actor)$s$,$p$next_version,p_data->>'acceptance_text',p_actor,p_data->>'audience')$p$);
 changed:=replace(changed,'and sandbox_onboarding_id is not distinct from doc.sandbox_onboarding_id','and sandbox_onboarding_id is not distinct from doc.sandbox_onboarding_id and audience=doc.audience');
 if changed=definition or position('LEGAL_AUDIENCE_REQUIRED' in changed)=0 then raise exception 'LEGAL_AUDIENCE_PATCH_FAILED';end if;
 execute changed;
 definition:=pg_get_functiondef('public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text)'::regprocedure);
 definition:=replace(definition,'initial_version:=flow.version;','perform public.assert_legal_partner_kind(flow.existing_partner_id,flow.requested_plan,flow.partner_type); initial_version:=flow.version;');
 changed:=replace(definition,'select array_agg(distinct t order by t) into required_types from unnest(flow.required_document_types) t;',
 $p$-- Lock optional commercial documents before determining the required set.
 for kind in select distinct x from unnest(flow.required_document_types||array['PRICE_SHEET','CONDITIONS']) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended('legal:'||kind,0));
 end loop;
 select array_agg(distinct t order by t) into required_types from (
  select unnest(flow.required_document_types) t union
  select document_type from public.legal_documents where document_type in ('PRICE_SHEET','CONDITIONS') and status='ACTIVE' and effective_from<=now() and deletion_requested_at is null
   and audience=public.legal_audience_for(flow.requested_plan,flow.partner_type)
   and ((flow.sandbox_only and sandbox_onboarding_id=flow.id) or (not flow.sandbox_only and sandbox_onboarding_id is null))
 ) required;
 $p$);
 changed:=replace(changed,$s$where document_type=kind and status='ACTIVE'$s$,$p$where document_type=kind and status='ACTIVE' and (audience=public.legal_audience_for(flow.requested_plan,flow.partner_type) or (flow.sandbox_only and audience='LEGACY'))$p$);
 if changed=definition then raise exception 'LEGAL_AUDIENCE_STEP_PATCH_FAILED';end if;execute changed;
 definition:=pg_get_functiondef('public.protect_legal_acceptance()'::regprocedure);
 changed:=replace(definition,'new.document_type:=doc.document_type;',
 $p$if doc.audience is distinct from public.legal_audience_for(flow.requested_plan,flow.partner_type) and not (flow.sandbox_only and doc.audience='LEGACY') then raise exception 'LEGAL_AUDIENCE_MISMATCH';end if;
 new.document_type:=doc.document_type;$p$);
 if changed=definition then raise exception 'LEGAL_AUDIENCE_EVIDENCE_PATCH_FAILED';end if;execute changed;
end $$;
