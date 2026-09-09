-- Private shared marketing library; all authorization is in the authenticated
-- portal API. No anonymous/authenticated SQL or Storage policies are granted.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ehv-marketing-kit','ehv-marketing-kit',false,10485760,
  array['application/pdf','image/png','image/jpeg','image/webp','text/plain'])
on conflict (id) do update set public=false,
  file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.marketing_kit_assets (
  id uuid primary key,
  category text not null check (category in ('flyer','website_badge','social','whatsapp')),
  name text not null check (char_length(name) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg','image/webp','text/plain')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  object_path text not null unique,
  sha256 text not null,
  status text not null default 'draft' check (status in ('draft','published','deleted')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  storage_deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.marketing_kit_assets enable row level security;
revoke all on public.marketing_kit_assets from anon, authenticated;
grant all on public.marketing_kit_assets to service_role;
create index marketing_kit_visible on public.marketing_kit_assets (status,category,created_at desc);

create function public.audit_marketing_kit_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events (actor_user_id,action,entity_type,entity_id,metadata)
  values (new.updated_by,
    case when TG_OP='INSERT' then 'marketing_kit.uploaded'
      when new.storage_deleted_at is not null then 'marketing_kit.file_removed'
      when new.status='deleted' then 'marketing_kit.deleted'
      when new.status='published' then 'marketing_kit.published'
      else 'marketing_kit.withdrawn' end,
    'marketing_kit_asset',new.id::text,
    jsonb_build_object('category',new.category,'status',new.status,'version',new.version));
  return new;
end $$;
revoke all on function public.audit_marketing_kit_change() from public,anon,authenticated;
create trigger marketing_kit_audit after insert or update of status,storage_deleted_at
  on public.marketing_kit_assets for each row execute function public.audit_marketing_kit_change();
