create or replace function public.pilot_migration_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'customers', coalesce(jsonb_array_length(payload #> '{productionMirror,tables,users}'), 0),
    'properties', coalesce(jsonb_array_length(payload #> '{productionMirror,tables,properties}'), 0),
    'propertyFiles', coalesce(jsonb_array_length(payload #> '{productionMirror,tables,property_files}'), 0),
    'availableDocuments', (select count(*) from public.documents where source_entity_type='production_property_file' and deleted_at is null),
    'runtimeRevision', revision
  )
  from public.portal_runtime_state
  where id='primary'
$$;

revoke all on function public.pilot_migration_status() from public, anon, authenticated;
grant execute on function public.pilot_migration_status() to service_role;

