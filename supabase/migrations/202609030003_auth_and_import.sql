create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_manifest_sha256 text not null unique,
  status text not null default 'pending' check (status in ('pending','running','validated','failed','rolled_back')),
  expected_records integer not null default 0,
  imported_records integer not null default 0,
  expected_documents integer not null default 0,
  imported_documents integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.identity_imports (
  source_user_id text primary key,
  email text not null,
  display_name text not null default '',
  role text not null,
  active boolean not null default true,
  auth_user_id uuid references auth.users(id),
  activation_status text not null default 'pending' check (activation_status in ('pending','invited','activated','blocked')),
  imported_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table public.migration_runs enable row level security;
alter table public.identity_imports enable row level security;
create policy "admins read migration runs" on public.migration_runs for select using (public.is_admin());
create policy "admins read identity imports" on public.identity_imports for select using (public.is_admin());

create or replace function public.handle_new_portal_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare imported public.identity_imports%rowtype;
begin
  select * into imported from public.identity_imports where lower(email)=lower(new.email) limit 1;
  if found then
    insert into public.portal_users(id,display_name,role,status)
    values(new.id,imported.display_name,imported.role,case when imported.active then 'active' else 'disabled' end)
    on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,status=excluded.status,updated_at=now();
    update public.identity_imports set auth_user_id=new.id,activation_status='activated',activated_at=now() where source_user_id=imported.source_user_id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_ehv_portal on auth.users;
create trigger on_auth_user_created_ehv_portal after insert on auth.users
for each row execute procedure public.handle_new_portal_user();
