-- Read-only existence check, never exposed to anonymous/authenticated database
-- clients. Do not reveal who owns an existing contact or which role they hold.
create function public.customer_email_known(p_email text,p_skip_invitation_id text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare normalized text:=lower(btrim(p_email)); state jsonb; collection_name text;
begin
  if normalized is null or normalized='' then return false; end if;
  if exists(select 1 from auth.users where lower(btrim(email))=normalized)
    or exists(select 1 from public.identity_imports where lower(btrim(email))=normalized)
    or exists(select 1 from public.partners where lower(btrim(email))=normalized)
    then return true; end if;
  select payload into state from public.portal_runtime_state where id='primary';
  if state is null then raise exception 'CUSTOMER_DIRECTORY_UNAVAILABLE'; end if;
  foreach collection_name in array array['users','customers','partners','partnerReferralInvitations','customerInvitations','referralLeads'] loop
    if exists(select 1 from jsonb_array_elements(coalesce(state->collection_name,'[]'::jsonb)) item
      where lower(btrim(item->>'email'))=normalized
      and not (p_skip_invitation_id is not null and collection_name in ('customerInvitations','partnerReferralInvitations')
        and coalesce(item->>'id','')=p_skip_invitation_id)) then return true; end if;
  end loop;
  foreach collection_name in array array['users','customers'] loop
    if exists(select 1 from jsonb_array_elements(coalesce(state->'productionMirror'->'tables'->collection_name,'[]'::jsonb)) item
      where lower(btrim(item->>'email'))=normalized) then return true; end if;
  end loop;
  -- Preserve the imported source history too, including inactive/expired rows.
  return exists(select 1 from public.legacy_portal_records r
    where r.collection in ('users','customers','partners','partnerReferralInvitations','customerInvitations','referralLeads')
      and lower(btrim(r.payload->>'email'))=normalized
      and not (p_skip_invitation_id is not null and r.collection in ('customerInvitations','partnerReferralInvitations')
        and coalesce(r.payload->>'id',r.source_id)=p_skip_invitation_id));
end $$;
revoke all on function public.customer_email_known(text,text) from public,anon,authenticated;
grant execute on function public.customer_email_known(text,text) to service_role;

-- Reuse the existing revision-guarded transaction and audit. Holding the runtime
-- row lock while rechecking prevents two invitations for the same new address
-- being committed by concurrent partner/admin/public-referral requests.
create function public.replace_portal_runtime_with_customer_invitation(
  expected_revision bigint,next_payload jsonb,audit_actor uuid,audit_action text,
  audit_entity_type text,audit_entity_id text,audit_metadata jsonb,invitation_email text
) returns table(revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare current_revision bigint; target_collection text; normalized text:=lower(btrim(invitation_email));
begin
  target_collection:=case audit_action when 'referral.invitation.created' then 'partnerReferralInvitations'
    when 'customer.invitation.created' then 'customerInvitations' when 'referral.lead.created' then 'referralLeads' else null end;
  if target_collection is null or normalized is null or normalized='' or not exists(
    select 1 from jsonb_array_elements(coalesce(next_payload->target_collection,'[]'::jsonb)) item
    where item->>'id'=audit_entity_id and lower(btrim(item->>'email'))=normalized
  ) then raise exception 'INVALID_CUSTOMER_INVITATION'; end if;
  select s.revision into current_revision from public.portal_runtime_state s where s.id='primary' for update;
  if current_revision is distinct from expected_revision then raise exception 'runtime_revision_conflict'; end if;
  if public.customer_email_known(normalized) then raise exception 'CUSTOMER_EMAIL_ALREADY_KNOWN'; end if;
  return query select * from public.replace_portal_runtime_state(expected_revision,next_payload,audit_actor,
    audit_action,audit_entity_type,audit_entity_id,audit_metadata);
end $$;
revoke all on function public.replace_portal_runtime_with_customer_invitation(bigint,jsonb,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.replace_portal_runtime_with_customer_invitation(bigint,jsonb,uuid,text,text,text,jsonb,text) to service_role;
