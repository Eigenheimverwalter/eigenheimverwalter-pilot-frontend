create table if not exists public.trades (
  code text primary key,
  name text not null,
  tier text not null check (tier in ('standard','premium','special')),
  active boolean not null default true
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  organization_id uuid references public.organizations(id) on delete cascade,
  primary_trade_code text not null references public.trades(code),
  company text not null,
  contact_name text,
  email text not null,
  status text not null default 'invited' check (status in ('invited','active','paused','disabled')),
  cooperation_start date,
  cooperation_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_postal_licenses (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  included boolean not null default false,
  reserved_at date not null,
  valid_until date not null,
  created_at timestamptz not null default now(),
  unique(partner_id, postal_code)
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  property_id uuid not null references public.properties(id) on delete cascade,
  trade_code text not null references public.trades(code),
  label text not null,
  specifications jsonb not null default '{}'::jsonb,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','partial','verified')),
  verified_by uuid references public.portal_users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_cases (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  property_id uuid not null references public.properties(id) on delete cascade,
  equipment_id uuid references public.equipment(id),
  partner_id uuid references public.partners(id),
  title text not null,
  service_type text not null,
  status text not null default 'new',
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  requested_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  service_case_id uuid references public.service_cases(id),
  property_id uuid not null references public.properties(id) on delete cascade,
  equipment_id uuid references public.equipment(id),
  partner_id uuid references public.partners(id),
  performed_on date not null,
  service_type text not null,
  reason text,
  verified boolean not null default false,
  created_by uuid references public.portal_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  property_id uuid not null references public.properties(id) on delete cascade,
  equipment_id uuid references public.equipment(id),
  partner_id uuid not null references public.partners(id),
  document_id uuid references public.documents(id),
  status text not null default 'uploaded' check (status in ('uploaded','opened','accepted','rejected','withdrawn')),
  uploaded_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.portal_users(id) on delete cascade,
  type text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.trigger_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trigger_events (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  trigger_definition_id uuid not null references public.trigger_definitions(id),
  external_event_id text,
  event_start timestamptz,
  event_end timestamptz,
  region jsonb not null default '{}'::jsonb,
  severity numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.partner_opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id text unique,
  trigger_event_id uuid not null references public.trigger_events(id),
  partner_id uuid not null references public.partners(id),
  trade_code text not null references public.trades(code),
  property_count integer not null default 0,
  high_priority_count integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.trades enable row level security;
alter table public.partners enable row level security;
alter table public.partner_postal_licenses enable row level security;
alter table public.equipment enable row level security;
alter table public.service_cases enable row level security;
alter table public.service_records enable row level security;
alter table public.offers enable row level security;
alter table public.notifications enable row level security;
alter table public.trigger_definitions enable row level security;
alter table public.trigger_events enable row level security;
alter table public.partner_opportunities enable row level security;

create policy "authenticated read trades" on public.trades for select to authenticated using (active);
create policy "admin read partners" on public.partners for select using (public.is_admin());
create policy "member read own partner" on public.partners for select using (
  exists(select 1 from public.organization_members m where m.organization_id=partners.organization_id and m.user_id=auth.uid())
);
create policy "admin read postal licenses" on public.partner_postal_licenses for select using (public.is_admin());
create policy "member read own postal licenses" on public.partner_postal_licenses for select using (
  exists(select 1 from public.partners p join public.organization_members m on m.organization_id=p.organization_id where p.id=partner_postal_licenses.partner_id and m.user_id=auth.uid())
);
create policy "equipment scoped read" on public.equipment for select using (public.can_read_property(property_id));
create policy "service cases scoped read" on public.service_cases for select using (public.can_read_property(property_id));
create policy "service records scoped read" on public.service_records for select using (public.can_read_property(property_id));
create policy "offers scoped read" on public.offers for select using (public.can_read_property(property_id));
create policy "own notifications read" on public.notifications for select using (recipient_user_id=auth.uid() or public.is_admin());
create policy "admin trigger definitions read" on public.trigger_definitions for select using (public.is_admin());
create policy "admin trigger events read" on public.trigger_events for select using (public.is_admin());
create policy "partner opportunities read" on public.partner_opportunities for select using (
  public.is_admin() or exists(
    select 1 from public.partners p join public.organization_members m on m.organization_id=p.organization_id
    where p.id=partner_opportunities.partner_id and m.user_id=auth.uid()
  )
);

insert into public.trades(code,name,tier) values
 ('heating','Heizung','standard'),('roof','Dach','standard'),('facade','Fassade','standard'),
 ('windows','Fenster','standard'),('electrical','Elektrik','standard'),('sanitary','Sanitär','standard'),
 ('ventilation','Lüftung/Klimaanlage','premium'),('wastewater_pipes','Abwasserrohre','premium'),
 ('kitchen','Küche','premium'),('solar','Photovoltaik','premium'),('solar_storage','Batteriespeicher','premium'),
 ('solar_thermal','Solarthermie','premium'),('smoke_detector','Rauchmelder','premium'),
 ('elevator','Fahrstuhl','premium'),('fireplace','Kamin/Schornstein','premium'),
 ('wastewater_lifting','Hebeanlage/Pumpstation','premium'),('broker','Immobilienmakler','special'),
 ('whitelabel','Whitelabelpartner','special')
on conflict(code) do update set name=excluded.name,tier=excluded.tier;
