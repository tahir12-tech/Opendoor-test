-- Automated expiry-reminder system: per-application per-threshold ledger (for
-- exactly-once firing across reruns) + a denormalised count for the UI indicator.
create table if not exists public.expiry_reminders (
  application_id uuid not null references public.applications(id) on delete cascade,
  threshold text not null,          -- '30' | '14' | '7' | 'd6'..'d0'
  days_at_send int not null,
  sent_at timestamptz not null default now(),
  primary key (application_id, threshold)
);
alter table public.expiry_reminders enable row level security;
-- Service-role only: no policies, so anon/authenticated are blocked by RLS.

alter table public.applications add column if not exists expiry_reminders_sent int not null default 0;
alter table public.applications add column if not exists last_expiry_reminder_at timestamptz;

-- Fire due reminders for a given "today" (Europe/London date). Idempotent: each
-- (application, threshold) inserts once; a new row logs a business activity entry,
-- bumps the count, and is returned so the caller can email it. In-force =
-- Deed Issued, not refunded, expiry within the next 30 days (inclusive of today).
create or replace function public.fire_expiry_reminders(p_today date)
  returns table (
    application_id uuid, guarantee_ref text, days int, expiry_date date,
    agency text, branch text, referrer_id uuid, referrer_email text,
    referrer_name text, partner_id text, prop text
  )
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare r record; k text; d int;
begin
  for r in
    select a.id, a.guarantee_ref, a.expiry_date, a.referrer_id, a.partner_id,
           a.prop_addr1, a.prop_postcode,
           ag.name as agency_name, br.name as branch_name,
           u.email as ref_email, u.full_name as ref_name
    from public.applications a
    left join public.agencies ag on ag.id = a.agency_id
    left join public.branches br on br.id = a.branch_id
    left join public.users u on u.id = a.referrer_id
    where a.status = 'deed'
      and coalesce(a.payment_state, '') <> 'refunded'
      and a.expiry_date is not null
      and a.expiry_date >= p_today
      and a.expiry_date <= p_today + 30
  loop
    d := r.expiry_date - p_today;
    k := case when d <= 6 then 'd' || d when d <= 7 then '7' when d <= 14 then '14' else '30' end;
    insert into public.expiry_reminders (application_id, threshold, days_at_send)
      values (r.id, k, d) on conflict do nothing;
    if not found then continue; end if; -- already sent this threshold: skip
    update public.applications
      set expiry_reminders_sent = expiry_reminders_sent + 1, last_expiry_reminder_at = now()
      where id = r.id;
    insert into public.activity_log (application_id, kind, message, actor, visibility)
      values (r.id, 'expiry_reminder',
        'Expiry reminder: guarantee expires ' ||
          (case when d = 0 then 'today' when d = 1 then 'tomorrow' else 'in ' || d || ' days' end) ||
          ' (' || to_char(r.expiry_date, 'DD/MM/YYYY') || ').',
        'System', 'business');
    application_id := r.id; guarantee_ref := r.guarantee_ref; days := d; expiry_date := r.expiry_date;
    agency := r.agency_name; branch := r.branch_name; referrer_id := r.referrer_id;
    referrer_email := r.ref_email; referrer_name := r.ref_name; partner_id := r.partner_id;
    prop := nullif(trim(both ', ' from concat_ws(', ', r.prop_addr1, r.prop_postcode)), '');
    return next;
  end loop;
end $function$;

revoke all on function public.fire_expiry_reminders(date) from public, anon, authenticated;
grant execute on function public.fire_expiry_reminders(date) to service_role;
