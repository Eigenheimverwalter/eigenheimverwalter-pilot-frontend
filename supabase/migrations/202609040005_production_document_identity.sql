do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_source_entity_unique'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_source_entity_unique
      unique (source_entity_type, source_entity_id);
  end if;
end $$;

