create table if not exists public.portal_runtime_state (
  id text primary key check (id = 'primary'),
  payload jsonb not null default '{}'::jsonb,
  source_manifest_sha256 text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portal_runtime_state enable row level security;

revoke all on table public.portal_runtime_state from anon, authenticated;

comment on table public.portal_runtime_state is
  'Transitional canonical snapshot for the Pilot portal. Service-role only; replaced incrementally by normalized tables.';

