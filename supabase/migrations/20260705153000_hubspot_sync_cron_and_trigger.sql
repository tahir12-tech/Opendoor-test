-- =====================================================================
-- HubSpot sync — operational triggers
--   (1) pg_cron job every 2 minutes: consumes activity_log since the cursor and
--       upserts to HubSpot. Mirrors the existing reminder crons (net.http_post +
--       the reminders_cron secret; the function validates x-ops-secret).
--   (2) trigger_hubspot_sync(): admin (superadmin) on-demand trigger for the
--       Reconciliation screen's "Sync HubSpot" button. Same is_admin() gate as
--       confirm_org_entity; reads the secret server-side and fires the function
--       via pg_net (fire-and-forget) — the function's own auth is unchanged.
-- =====================================================================

-- (1) Cron: every 2 minutes.
do $$
begin
  perform cron.unschedule('hubspot-sync');
exception when others then null;  -- not scheduled yet
end $$;

select cron.schedule('hubspot-sync', '*/2 * * * *', $cmd$
  select net.http_post(
    url := 'https://pwftaqtrrqtilxlvwxjd.supabase.co/functions/v1/hubspot-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ops-secret', (select secret from public.ops_secrets where name = 'reminders_cron')),
    body := jsonb_build_object('limit', 200));
$cmd$);

-- (2) Admin on-demand trigger (Reconciliation "Sync HubSpot" button).
create or replace function public.trigger_hubspot_sync()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_req bigint;
begin
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select net.http_post(
    url := 'https://pwftaqtrrqtilxlvwxjd.supabase.co/functions/v1/hubspot-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ops-secret', (select secret from public.ops_secrets where name = 'reminders_cron')),
    body := jsonb_build_object('limit', 200)
  ) into v_req;
  return jsonb_build_object('ok', true, 'request_id', v_req);
end $$;
revoke execute on function public.trigger_hubspot_sync() from public, anon;
grant execute on function public.trigger_hubspot_sync() to authenticated;

comment on function public.trigger_hubspot_sync() is
  'Admin (superadmin) on-demand HubSpot sync trigger for the Reconciliation screen; fires the hubspot-sync edge function via pg_net.';
