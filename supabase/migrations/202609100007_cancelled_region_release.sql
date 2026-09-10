do $$declare definition text; changed text;
begin
 definition:=pg_get_functiondef('public.end_due_partner_cancellations()'::regprocedure);
 changed:=replace(definition,'  update public.portal_users set status=',
 $patch$  if r.onboarding_id is not null and jsonb_typeof(s.payload->'partnerRegionReservations')='array' then
   s.payload:=jsonb_set(s.payload,'{partnerRegionReservations}',coalesce((select jsonb_agg(case when x->>'onboarding_id'=r.onboarding_id and x->>'status'='ACTIVE' then x||jsonb_build_object('status','RELEASED','released_at',now(),'reason','contract_ended') else x end) from jsonb_array_elements(s.payload->'partnerRegionReservations') x),'[]'::jsonb));
  end if;
  update public.portal_users set status=$patch$);
 if changed=definition then raise exception 'CANCELLATION_REGION_PATCH_FAILED';end if;
 execute changed;
end $$;
