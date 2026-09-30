alter table public.portal_users drop constraint if exists portal_users_role_check;
alter table public.portal_users add constraint portal_users_role_check check (
  role in ('super_admin','admin_light','support_staff','partner_manager','crafts_partner','broker_partner','partner_basic','referral_partner')
);
