-- set_application_status is a manual status-transition utility (in production the
-- Sent->Paid->Deed transitions are driven by Stripe/PandaDoc webhooks via
-- service-role RPCs). It must be opndoor-admin-only: management must not be able
-- to flip an application's status by hand (that would bypass payment/deed
-- generation). Tighten the internal permission check from "admin OR management-
-- in-partner" to "admin only". AAL2 + status validation unchanged.
create or replace function public.set_application_status(p_app uuid, p_status text)
  returns public.applications
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare a public.applications;
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if p_status not in ('sent','paid','deed') then raise exception 'invalid status'; end if;
  select * into a from public.applications where id = p_app;
  if not found then raise exception 'application not found'; end if;
  -- opndoor admin only. Real Stripe/PandaDoc transitions run through service-role RPCs.
  if not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.applications set
    status         = p_status,
    paid_at        = case when p_status in ('paid','deed') then coalesce(paid_at, now())      else paid_at end,
    deed_issued_at = case when p_status = 'deed'           then coalesce(deed_issued_at, now()) else deed_issued_at end,
    issue_date     = case when p_status = 'deed'           then coalesce(issue_date, now()::date) else issue_date end
  where id = p_app returning * into a;
  return a;
end $function$;

revoke all on function public.set_application_status(uuid, text) from public, anon;
grant execute on function public.set_application_status(uuid, text) to authenticated, service_role;
