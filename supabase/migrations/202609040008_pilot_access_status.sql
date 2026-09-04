create or replace function public.pilot_migration_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'customers', coalesce(jsonb_array_length(runtime.payload #> '{productionMirror,tables,users}'), 0),
    'properties', coalesce(jsonb_array_length(runtime.payload #> '{productionMirror,tables,properties}'), 0),
    'propertyFiles', coalesce(jsonb_array_length(runtime.payload #> '{productionMirror,tables,property_files}'), 0),
    'availableDocuments', (select count(*) from public.documents where source_entity_type='production_property_file' and deleted_at is null),
    'runtimeRevision', runtime.revision,
    'activeAdminProfiles', (
      select count(*) from public.portal_users
      where status='active' and role in ('super_admin','admin_light')
    ),
    'activeInfoAdmin', exists (
      select 1
      from public.identity_imports identity_record
      join public.portal_users profile on profile.id=identity_record.auth_user_id
      where lower(identity_record.email)=lower('info@eigenheimverwalter.de')
        and identity_record.activation_status='activated'
        and profile.status='active'
        and profile.role='super_admin'
    )
  )
  from public.portal_runtime_state runtime
  where runtime.id='primary'
$$;

revoke all on function public.pilot_migration_status() from public, anon, authenticated;
grant execute on function public.pilot_migration_status() to service_role;
