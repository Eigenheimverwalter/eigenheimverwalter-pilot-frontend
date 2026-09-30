-- Additive only. Existing identities, runtime partners, referrals and licenses
-- are not rewritten and no existing partner is retrospectively marked accepted.
create table public.partner_onboardings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('SELF_SERVICE_BASIC','SELF_SERVICE_PREMIUM','SALES_OS','ADMIN_INVITE','CRM_IMPORT')),
  partner_id text,
  existing_partner_id text,
  sales_lead_id text,
  invite_id text,
  requested_plan text not null check (requested_plan in ('BASIC','PREMIUM')),
  partner_type text not null check (partner_type in ('EQUIPMENT_PARTNER','BROKER_PARTNER','REFERRAL')),
  equipment_type text,
  prefilled_data jsonb not null default '{}'::jsonb,
  status text not null default 'CREATED' check (status in ('CREATED','INVITED','STARTED','DATA_INCOMPLETE','DATA_COMPLETE','LEGAL_PENDING','LEGAL_ACCEPTED','CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED','READY_FOR_ACTIVATION','ACTIVE','CANCELLED','EXPIRED')),
  token_hash text unique,
  expires_at timestamptz,
  auth_user_id uuid references auth.users(id) on delete restrict,
  identity_verified boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (partner_type <> 'EQUIPMENT_PARTNER' or nullif(equipment_type,'') is not null),
  check (source <> 'SALES_OS' or nullif(sales_lead_id,'') is not null)
);
create unique index partner_onboarding_sales_source on public.partner_onboardings(source,sales_lead_id)
  where sales_lead_id is not null;
create unique index partner_onboarding_open_upgrade on public.partner_onboardings(existing_partner_id)
  where existing_partner_id is not null and status not in ('ACTIVE','CANCELLED','EXPIRED');

create table public.legal_documents (
  id uuid primary key,
  document_type text not null check (document_type ~ '^[A-Z][A-Z_]{1,59}$'),
  title text not null check (char_length(title) between 1 and 180),
  file_name text not null check (char_length(file_name) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null default 'application/pdf' check (mime_type='application/pdf'),
  file_size integer not null check (file_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  version integer not null check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','ACTIVE','ARCHIVED')),
  acceptance_text text not null check (char_length(acceptance_text) between 1 and 2000),
  uploaded_by uuid references public.portal_users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  approved_by uuid references public.portal_users(id) on delete restrict,
  approved_at timestamptz,
  effective_from timestamptz,
  archived_at timestamptz,
  deletion_requested_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_type,version)
);
create unique index legal_one_active_version on public.legal_documents(document_type) where status='ACTIVE';
create table public.legal_document_versions (
  document_type text primary key,
  last_version integer not null check (last_version>0)
);
alter table public.legal_document_versions enable row level security;
revoke all on public.legal_document_versions from public,anon,authenticated;
grant all on public.legal_document_versions to service_role;

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  partner_id text,
  onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  legal_document_id uuid not null references public.legal_documents(id) on delete restrict,
  document_type text not null,
  document_version integer not null,
  accepted_at timestamptz not null default now(),
  accepted_ip inet,
  user_agent text not null default '',
  accepted_by_email text not null,
  acceptance_text text not null,
  created_at timestamptz not null default now(),
  unique(onboarding_id,legal_document_id)
);
alter table public.partner_onboardings enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
revoke all on public.partner_onboardings,public.legal_documents,public.legal_acceptances from public,anon,authenticated;
grant all on public.partner_onboardings,public.legal_documents,public.legal_acceptances to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ehv-legal-documents','ehv-legal-documents',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Acceptances cannot be relabelled or moved onto a later version. Lock the same
-- document type as activation, so activation and acceptance cannot race.
create function public.protect_legal_acceptance() returns trigger
language plpgsql security definer set search_path=public as $$
declare doc public.legal_documents; flow public.partner_onboardings;
begin
  if TG_OP <> 'INSERT' then raise exception 'LEGAL_ACCEPTANCE_IMMUTABLE'; end if;
  select * into doc from public.legal_documents where id=new.legal_document_id;
  if not found then raise exception 'LEGAL_DOCUMENT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('legal:'||doc.document_type,0));
  select * into doc from public.legal_documents where id=new.legal_document_id for share;
  if doc.status<>'ACTIVE' or doc.deletion_requested_at is not null or doc.effective_from is null or doc.effective_from>now() then
    raise exception 'LEGAL_VERSION_NOT_ACTIVE';
  end if;
  select * into flow from public.partner_onboardings where id=new.onboarding_id for update;
  if not found or not flow.identity_verified or flow.status in ('ACTIVE','CANCELLED','EXPIRED') then
    raise exception 'ONBOARDING_NOT_OPEN';
  end if;
  if new.accepted_by_email is distinct from lower(flow.prefilled_data->>'email') then raise exception 'ACCEPTANCE_IDENTITY_MISMATCH'; end if;
  new.document_type:=doc.document_type;
  new.document_version:=doc.version;
  new.acceptance_text:=doc.acceptance_text;
  new.accepted_at:=now(); new.created_at:=now();
  new.partner_id:=coalesce(flow.partner_id,flow.existing_partner_id);
  return new;
end $$;
create trigger legal_acceptance_protected before insert or update or delete on public.legal_acceptances
  for each row execute function public.protect_legal_acceptance();

create function public.protect_legal_document() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then
    if old.status<>'DRAFT' or old.deletion_requested_at is null or exists(select 1 from public.legal_acceptances where legal_document_id=old.id) then
      raise exception 'LEGAL_DOCUMENT_RETAINED';
    end if;
    return old;
  end if;
  if (new.id,new.document_type,new.title,new.file_name,new.storage_path,new.mime_type,new.file_size,new.sha256,new.version,new.acceptance_text,new.uploaded_by,new.uploaded_at)
    is distinct from
    (old.id,old.document_type,old.title,old.file_name,old.storage_path,old.mime_type,old.file_size,old.sha256,old.version,old.acceptance_text,old.uploaded_by,old.uploaded_at) then
    raise exception 'LEGAL_DOCUMENT_VERSION_IMMUTABLE';
  end if;
  if old.deletion_requested_at is not null and (new.deletion_requested_at is null or new.status<>'DRAFT') then raise exception 'LEGAL_DOCUMENT_DELETING'; end if;
  if new.status is distinct from old.status and not (
    (old.status='DRAFT' and new.status='APPROVED') or
    (old.status='APPROVED' and new.status in ('ACTIVE','ARCHIVED')) or
    (old.status='ACTIVE' and new.status='ARCHIVED')
  ) then raise exception 'INVALID_LEGAL_TRANSITION'; end if;
  return new;
end $$;
create trigger legal_document_protected before update or delete on public.legal_documents
  for each row execute function public.protect_legal_document();

-- Only the authenticated Edge adapter can call this. Permission keys are checked
-- there using existing roleProfiles, never values supplied by a browser.
create function public.change_legal_document(p_action text,p_id uuid,p_actor uuid,p_revision bigint default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare doc public.legal_documents; kind text; next_version integer; actor_role text; allowed jsonb; required_key text;
begin
  if p_actor is null or not exists(select 1 from public.portal_users where id=p_actor and status='active' and role in ('super_admin','admin_light')) then
    raise exception 'LEGAL_PERMISSION_DENIED';
  end if;
  select role into actor_role from public.portal_users where id=p_actor;
  if actor_role='admin_light' then
    select coalesce(r->'permissions','[]'::jsonb) into allowed from public.portal_runtime_state s,
      lateral jsonb_array_elements(coalesce(s.payload->'roleProfiles','[]'::jsonb)) r
      where s.id='primary' and r->>'role'='admin_light' limit 1;
    required_key:=case p_action when 'UPLOAD' then 'legal_documents.upload' when 'APPROVE' then 'legal_documents.approve' when 'ACTIVATE' then 'legal_documents.activate' when 'ARCHIVE' then 'legal_documents.activate' else 'legal_documents.delete' end;
    if not coalesce(allowed ? '*',false) and not (coalesce(allowed ? 'legal_documents.read',false) and coalesce(allowed ? required_key,false)) then raise exception 'LEGAL_PERMISSION_DENIED'; end if;
  end if;
  if p_action='UPLOAD' then kind:=p_data->>'document_type';
  else select document_type into kind from public.legal_documents where id=p_id;
    if not found then raise exception 'LEGAL_DOCUMENT_NOT_FOUND'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('legal:'||kind,0));
  if p_action='UPLOAD' then
    insert into public.legal_document_versions(document_type,last_version) values(kind,1)
      on conflict(document_type) do update set last_version=legal_document_versions.last_version+1
      returning last_version into next_version;
    insert into public.legal_documents(id,document_type,title,file_name,storage_path,file_size,sha256,version,acceptance_text,uploaded_by)
    values(p_id,kind,p_data->>'title',p_data->>'file_name',p_data->>'storage_path',(p_data->>'file_size')::integer,p_data->>'sha256',next_version,p_data->>'acceptance_text',p_actor)
    returning * into doc;
  else
    select * into doc from public.legal_documents where id=p_id for update;
    if not found then raise exception 'LEGAL_DOCUMENT_NOT_FOUND'; end if;
    if p_revision is null or doc.revision<>p_revision then raise exception 'LEGAL_VERSION_CONFLICT'; end if;
    if p_action='APPROVE' then
      if doc.status<>'DRAFT' or doc.deletion_requested_at is not null then raise exception 'INVALID_LEGAL_TRANSITION'; end if;
      update public.legal_documents set status='APPROVED',approved_by=p_actor,approved_at=now(),updated_at=now(),revision=revision+1 where id=p_id returning * into doc;
    elsif p_action='ACTIVATE' then
      if doc.status<>'APPROVED' or nullif(p_data->>'effective_from','') is null or (p_data->>'effective_from')::timestamptz>now() then raise exception 'LEGAL_EFFECTIVE_DATE_REQUIRED'; end if;
      insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
        select p_actor,'legal_document_archived','legal_document',id::text,jsonb_build_object('document_type',kind,'version',version,'superseded_by',p_id)
        from public.legal_documents where document_type=kind and status='ACTIVE';
      update public.legal_documents set status='ARCHIVED',archived_at=now(),updated_at=now(),revision=revision+1 where document_type=kind and status='ACTIVE';
      update public.legal_documents set status='ACTIVE',effective_from=(p_data->>'effective_from')::timestamptz,updated_at=now(),revision=revision+1 where id=p_id returning * into doc;
    elsif p_action='ARCHIVE' then
      if doc.status not in ('APPROVED','ACTIVE') then raise exception 'INVALID_LEGAL_TRANSITION'; end if;
      update public.legal_documents set status='ARCHIVED',archived_at=now(),updated_at=now(),revision=revision+1 where id=p_id returning * into doc;
    elsif p_action in ('DELETE_PREPARE','DELETE_COMPLETE') then
      if doc.status<>'DRAFT' or exists(select 1 from public.legal_acceptances where legal_document_id=p_id) then raise exception 'LEGAL_DOCUMENT_RETAINED'; end if;
      if p_action='DELETE_PREPARE' then
        update public.legal_documents set deletion_requested_at=coalesce(deletion_requested_at,now()),updated_at=now(),revision=revision+1 where id=p_id returning * into doc;
      else
        if doc.deletion_requested_at is null then raise exception 'LEGAL_DELETE_NOT_PREPARED'; end if;
        delete from public.legal_documents where id=p_id;
      end if;
    else raise exception 'INVALID_LEGAL_ACTION'; end if;
  end if;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,metadata)
  values(p_actor,case p_action when 'UPLOAD' then 'legal_document_uploaded' when 'APPROVE' then 'legal_document_approved' when 'ACTIVATE' then 'legal_document_activated' when 'ARCHIVE' then 'legal_document_archived' when 'DELETE_PREPARE' then 'legal_document_deletion_requested' else 'legal_document_deleted' end,
    'legal_document',p_id::text,jsonb_build_object('document_type',kind,'version',doc.version,'status',doc.status));
  return to_jsonb(doc);
end $$;
revoke all on function public.protect_legal_acceptance(),public.protect_legal_document(),public.change_legal_document(text,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.change_legal_document(text,uuid,uuid,bigint,jsonb) to service_role;
