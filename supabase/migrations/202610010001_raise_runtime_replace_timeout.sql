-- The production mirror has grown beyond PostgREST's default statement timeout.
-- Keep the atomic revision check and audit write, but allow this specific
-- service-role-only operation enough time to replace the large JSONB snapshot.
alter function public.replace_portal_runtime_state(
  bigint,
  jsonb,
  uuid,
  text,
  text,
  text,
  jsonb
) set statement_timeout = '60s';

