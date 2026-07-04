-- User lifecycle hardening: real Pending/Active/Deactivated states, ban-based
-- deactivation, session revocation, MFA reset, role changes behind a hard
-- role-model wall + self/last-admin guards, all audited. Admin actions run in
-- SECURITY DEFINER RPCs (they touch the auth schema) gated on AAL2 + admin or
-- management-of-partner.

-- 1) Deactivated is a first-class status.
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check
  check (status = any (array['active','pending','deactivated']));

-- 2) Immutable audit of user lifecycle changes (who, when, what, old -> new).
create table if not exists public.user_audit (
  id uuid primary key default gen_random_uuid(),
  target_user uuid not null references public.users(id) on delete cascade,
  partner_id uuid,                 -- target's partner at action time (management read scoping)
  action text not null,            -- status | role | reset_mfa
  old_value text,
  new_value text,
  actor text,
  actor_id uuid,
  at timestamptz not null default now()
);
create index if not exists user_audit_target_at_idx on public.user_audit(target_user, at desc);
alter table public.user_audit enable row level security;

-- Admins read all; management reads its own partner's rows. Writes happen only
-- through the definer RPCs below (no client write policy: append-only).
drop policy if exists user_audit_read on public.user_audit;
create policy user_audit_read on public.user_audit
  for select to authenticated
  using (public.is_admin() or (public.app_role() = 'management' and partner_id = public.app_partner()));

drop policy if exists require_aal2 on public.user_audit;
create policy require_aal2 on public.user_audit
  as restrictive for all to authenticated
  using (public.is_aal2()) with check (public.is_aal2());

-- 3) The admin user list, with TRUTHFUL last-active from auth.users.last_sign_in_at
--    and a verified-MFA flag. Visibility mirrors the users_select RLS policy.
create or replace function public.list_managed_users()
returns table (
  id uuid, full_name text, email text, role text, status text,
  partner_slug text, last_sign_in_at timestamptz, has_mfa boolean
)
language sql security definer set search_path to '' stable
as $function$
  select u.id, u.full_name, u.email, u.role, u.status,
         p.slug as partner_slug,
         au.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as has_mfa
  from public.users u
  left join public.partners p on p.id = u.partner_id
  left join auth.users au on au.id = u.id
  where public.is_aal2()
    and (public.is_admin()
         or (public.app_role() = 'management' and u.partner_id = public.app_partner())
         or u.id = auth.uid());
$function$;

-- 4) Deactivate / reactivate. Deactivation bans the auth user (blocks sign-in)
--    and revokes their live sessions; reactivation lifts the ban.
create or replace function public.admin_set_user_status(p_user uuid, p_status text)
returns public.users
language plpgsql security definer set search_path to ''
as $function$
declare cur public.users; res public.users; who text; me uuid := auth.uid(); old_status text;
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if p_status not in ('active','deactivated') then raise exception 'Invalid status' using errcode = '22023'; end if;

  select * into cur from public.users where id = p_user;
  if cur.id is null then raise exception 'User not found' using errcode = '22023'; end if;

  if not (public.is_admin()
          or (public.app_role() = 'management' and cur.partner_id = public.app_partner() and cur.role <> 'superadmin')) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_status = 'deactivated' and p_user = me then
    raise exception 'You cannot deactivate your own account.' using errcode = '42501';
  end if;
  if p_status = 'deactivated' and cur.role = 'superadmin'
     and (select count(*) from public.users where role = 'superadmin' and status = 'active') <= 1 then
    raise exception 'At least one active opndoor admin must remain.' using errcode = '42501';
  end if;

  old_status := cur.status;
  if old_status = p_status then return cur; end if;

  who := coalesce((select full_name from public.users where id = me), 'an administrator');
  update public.users set status = p_status where id = p_user returning * into res;

  if p_status = 'deactivated' then
    update auth.users set banned_until = 'infinity' where id = p_user;
    delete from auth.sessions where user_id = p_user;      -- revoke live sessions
  else
    update auth.users set banned_until = null where id = p_user;
  end if;

  insert into public.user_audit(target_user, partner_id, action, old_value, new_value, actor, actor_id)
  values (p_user, cur.partner_id, 'status', old_status, p_status, who, me);
  return res;
end $function$;

-- 5) Role change behind the hard role-model wall + self / last-admin guards.
create or replace function public.admin_update_user_role(p_user uuid, p_role text)
returns public.users
language plpgsql security definer set search_path to ''
as $function$
declare cur public.users; res public.users; who text; me uuid := auth.uid();
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if p_role not in ('superadmin','management','referrer') then raise exception 'Invalid role' using errcode = '22023'; end if;

  select * into cur from public.users where id = p_user;
  if cur.id is null then raise exception 'User not found' using errcode = '22023'; end if;

  if not (public.is_admin()
          or (public.app_role() = 'management' and cur.partner_id = public.app_partner() and cur.role <> 'superadmin')) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- Role-model wall (both directions).
  if cur.role = 'superadmin' and p_role <> 'superadmin' then
    raise exception 'An opndoor admin cannot be reassigned to a partner role.' using errcode = '22023';
  end if;
  if cur.role <> 'superadmin' and p_role not in ('management','referrer') then
    raise exception 'A partner user can only be Management or Referrer.' using errcode = '22023';
  end if;

  -- Self-service guard: cannot change one's own role.
  if p_user = me and p_role <> cur.role then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;
  -- Last active opndoor admin must remain.
  if cur.role = 'superadmin' and p_role <> 'superadmin'
     and (select count(*) from public.users where role = 'superadmin' and status = 'active') <= 1 then
    raise exception 'At least one active opndoor admin must remain.' using errcode = '42501';
  end if;

  if cur.role = p_role then return cur; end if;

  who := coalesce((select full_name from public.users where id = me), 'an administrator');
  update public.users set role = p_role where id = p_user returning * into res;

  insert into public.user_audit(target_user, partner_id, action, old_value, new_value, actor, actor_id)
  values (p_user, cur.partner_id, 'role', cur.role, p_role, who, me);
  return res;
end $function$;

-- 6) Reset a user's MFA: delete their factors and sessions so they re-enrol and
--    re-authenticate at next sign-in.
create or replace function public.admin_reset_user_mfa(p_user uuid)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare cur public.users; who text; me uuid := auth.uid();
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;

  select * into cur from public.users where id = p_user;
  if cur.id is null then raise exception 'User not found' using errcode = '22023'; end if;

  if not (public.is_admin()
          or (public.app_role() = 'management' and cur.partner_id = public.app_partner() and cur.role <> 'superadmin')) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  who := coalesce((select full_name from public.users where id = me), 'an administrator');
  delete from auth.mfa_factors where user_id = p_user;
  delete from auth.sessions where user_id = p_user;

  insert into public.user_audit(target_user, partner_id, action, old_value, new_value, actor, actor_id)
  values (p_user, cur.partner_id, 'reset_mfa', 'enrolled', 'reset', who, me);
end $function$;

-- Grants: signed-in users only; the bodies gate on AAL2 + admin/management.
revoke execute on function public.list_managed_users() from public, anon;
revoke execute on function public.admin_set_user_status(uuid, text) from public, anon;
revoke execute on function public.admin_update_user_role(uuid, text) from public, anon;
revoke execute on function public.admin_reset_user_mfa(uuid) from public, anon;
grant execute on function public.list_managed_users() to authenticated;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;
grant execute on function public.admin_update_user_role(uuid, text) to authenticated;
grant execute on function public.admin_reset_user_mfa(uuid) to authenticated;
