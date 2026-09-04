alter table public.documents alter column uploaded_by drop not null;
comment on column public.documents.uploaded_by is
  'Portal user who uploaded the file; null exclusively denotes a verified system migration.';

