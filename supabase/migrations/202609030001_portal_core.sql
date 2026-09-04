-- EHV Pilot: persistente Grundlage fuer die Ablösung des ephemeren Render-Stores.
create extension if not exists pgcrypto;

create type public.ehv_document_class as enum (
  'service', 'offer', 'invoice', 'equipment', 'land_register',
  'sales_file', 'broker_contract', 'notarial_contract', 'other'
);

create table if not exists public.portal_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('super_admin','admin_light','crafts_partner','broker_partner','partner_basic')),
  status text not null default 'active' check (status in ('invited','active','paused','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.portal_users(id) on delete cascade,
  primary key (organization_id, user_id)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  customer_user_id uuid references public.portal_users(id),
  street text, house_number text, postal_code text, city text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_assignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade_code text not null,
  status text not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  unique(property_id, organization_id, trade_code)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  document_class public.ehv_document_class not null,
  bucket_id text not null,
  object_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  sha256 text not null,
  uploaded_by uuid not null references public.portal_users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(bucket_id, object_path)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.portal_users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Verlustfreier Übergangsspeicher für noch nicht normalisierte Portalmodule.
-- Jede bisherige JSON-Collection wird zunächst 1:1 übernommen und anschließend
-- modulweise in Fachtabellen migriert. source_id + collection machen Importe idempotent.
create table if not exists public.legacy_portal_records (
  collection text not null,
  source_id text not null,
  payload jsonb not null,
  payload_sha256 text not null,
  imported_at timestamptz not null default now(),
  primary key (collection, source_id)
);

alter table public.portal_users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.properties enable row level security;
alter table public.property_assignments enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;
alter table public.legacy_portal_records enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.portal_users where id=auth.uid() and role in ('super_admin','admin_light') and status='active') $$;

create or replace function public.can_read_property(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.is_admin()
    or exists(select 1 from public.properties p where p.id=target and p.customer_user_id=auth.uid())
    or exists(
      select 1 from public.property_assignments a
      join public.organization_members m on m.organization_id=a.organization_id
      where a.property_id=target and m.user_id=auth.uid() and a.status='active'
        and (a.valid_until is null or a.valid_until > now())
    )
$$;

create policy "users read self or admin" on public.portal_users for select
using (id=auth.uid() or public.is_admin());
create policy "properties scoped read" on public.properties for select
using (public.can_read_property(id));
create policy "documents scoped read" on public.documents for select
using (deleted_at is null and property_id is not null and public.can_read_property(property_id));
create policy "admins read audit" on public.audit_events for select
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 ('ehv-service-documents','ehv-service-documents',false,52428800,array['application/pdf','image/png','image/jpeg']),
 ('ehv-sensitive-documents','ehv-sensitive-documents',false,52428800,array['application/pdf','image/png','image/jpeg']),
 ('ehv-sales-documents','ehv-sales-documents',false,52428800,array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public=false;

-- Direkte öffentliche Objektzugriffe bleiben gesperrt. Upload und Download erfolgen
-- über Edge Functions, die ACL, Dateisignatur, Audit und kurzlebige Signed URLs erzwingen.
