alter table public.documents
  add column if not exists source_property_id text,
  add column if not exists source_entity_type text,
  add column if not exists source_entity_id text;

create index if not exists documents_source_property_idx
  on public.documents(source_property_id)
  where deleted_at is null;
