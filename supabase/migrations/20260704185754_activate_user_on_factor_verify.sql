-- #76 onboarding completion: promote a user from 'pending' to 'active' the moment
-- they verify their first TOTP factor (the final step of the invite/accept journey).
-- Without this nothing ever flips the flag, so a fully onboarded invitee shows
-- "Pending" in the admin user list forever. Server-authoritative: fires however
-- onboarding completes. Idempotent: only touches a still-'pending' row, and login
-- MFA challenges do not change a factor's status column, so ordinary sign-ins are
-- untouched. A reset-2FA user is already 'active', so re-enrolment is a no-op here.
create or replace function public.activate_user_on_factor_verify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    update public.users set status = 'active'
      where id = new.user_id and status = 'pending';
  end if;
  return new;
end $function$;

drop trigger if exists users_activate_on_factor_verify on auth.mfa_factors;
create trigger users_activate_on_factor_verify
  after insert or update of status on auth.mfa_factors
  for each row execute function public.activate_user_on_factor_verify();
