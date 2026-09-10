create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Only a dedicated job token is passed to the worker, never the service key.
do $$begin
 if not exists(select 1 from vault.secrets where name='pilot_cancellation_job') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'pilot_cancellation_job');
 end if;
end $$;
create or replace function public.verify_cancellation_job_token(p_token text) returns boolean
language sql security definer set search_path=public as $$
 select exists(select 1 from vault.decrypted_secrets where name='pilot_cancellation_job' and decrypted_secret=p_token);
$$;
revoke all on function public.verify_cancellation_job_token(text) from public,anon,authenticated;
grant execute on function public.verify_cancellation_job_token(text) to service_role;
select cron.schedule('pilot-end-partnerships','7 * * * *','select public.end_due_partner_cancellations()');
select cron.schedule('pilot-cancellation-billing','17 * * * *',$job$
 select net.http_post(url:='https://rpniwtshbwjuesoeztyt.supabase.co/functions/v1/portal-cancellation-worker',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='pilot_cancellation_job')),
 body:='{}'::jsonb,timeout_milliseconds:=10000);
$job$);
