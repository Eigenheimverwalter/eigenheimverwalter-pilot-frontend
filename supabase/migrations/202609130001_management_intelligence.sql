create table if not exists public.kpi_definitions (
  code text primary key,
  name text not null,
  description text not null,
  module text not null,
  formula text not null,
  data_source text not null,
  update_frequency text not null,
  filters jsonb not null default '[]'::jsonb,
  drilldown_route text not null,
  status text not null default 'active' check (status in ('active','draft','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kpi_definitions enable row level security;
revoke all on public.kpi_definitions from anon, authenticated;
grant select on public.kpi_definitions to service_role;

comment on table public.kpi_definitions is 'Verbindliche Definitionen für Management-KPIs. Die Laufzeitberechnung bleibt in der gemeinsamen Management-Analytics-Schicht.';

insert into public.kpi_definitions(code,name,description,module,formula,data_source,update_frequency,filters,drilldown_route)
values
('ACTIVE_PROPERTIES','Aktive Immobilien','Aktive, nicht archivierte Immobilien','property','count(properties where status not in archived, deleted)','properties','near-real-time','["period","region","postalCode"]','/management/properties?status=active'),
('PREMIUM_CUSTOMERS','Premium Kunden','Kunden mit aktivem Premium-Tarif','property','count(customers where plan = premium and status = active)','customers','near-real-time','["period","region"]','/management/properties?plan=premium'),
('ACTIVE_PREMIUM_PARTNERS','Aktive Premium Partner','Aktive Partner mit Premium-Lizenz','partner','count(partners where status = active and plan = premium)','partners + licenses','near-real-time','["period","partnerType","equipment","region"]','/management/partners?plan=premium&status=active'),
('PARTNER_ARR','Partner ARR','Annualisierter Vertragswert aktiver bezahlter Partnerlizenzen','finance','sum(active paid license annual amount)','licenses + Stripe payments','near-real-time','["period","partnerType","plan"]','/management/revenue?metric=arr'),
('WON_TO_ACTIVE_RATE','Won-to-Activation Rate','Anteil gewonnener Sales-Leads mit aktiviertem Partner','sales','active sales-origin partners / won sales leads','SalesOS + partner_onboardings','5 minutes','["period","salesOwner","partnerType"]','/management/sales-funnel'),
('BASIC_TO_PREMIUM_RATE','Basic-to-Premium Conversion','Premium-Aktivierungen im Verhältnis zu upgradeberechtigten Basic Partnern','partner','paid premium upgrades / eligible basic partners','partners + checkout','near-real-time','["period","equipment","region"]','/management/basic-conversion'),
('OPPORTUNITY_CONVERSION','Opportunity Conversion','Abgeschlossene Aufträge im Verhältnis zu Opportunities','opportunity','completed orders / opportunities','opportunities + service orders','15 minutes','["period","equipment","region","partnerType"]','/management/opportunities')
on conflict (code) do update set name=excluded.name,description=excluded.description,module=excluded.module,formula=excluded.formula,data_source=excluded.data_source,update_frequency=excluded.update_frequency,filters=excluded.filters,drilldown_route=excluded.drilldown_route,status='active',updated_at=now();

update public.portal_runtime_state state_row
set payload=jsonb_set(state_row.payload,'{roleProfiles}',coalesce((select jsonb_agg(case when profile->>'role'='admin_light' then jsonb_set(profile,'{permissions}',coalesce(profile->'permissions','[]'::jsonb)||'["dashboard.read","sales.analytics.read","partner.analytics.read","contracts.read","referral.analytics.read","opportunity.analytics.read"]'::jsonb) else profile end) from jsonb_array_elements(coalesce(state_row.payload->'roleProfiles','[]'::jsonb)) profile),'[]'::jsonb),true),updated_at=now()
where state_row.id='primary';
