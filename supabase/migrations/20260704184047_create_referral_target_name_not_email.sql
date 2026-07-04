-- #69 root, on-the-fly path: store the provided contact name (may be '') rather
-- than defaulting it to the email. Displays fall back to the email when blank.
create or replace function public.create_referral_target(
  p_agency text, p_branch text,
  p_agency_email text default null, p_agency_contact_name text default null, p_agency_phone text default null,
  p_branch_email text default null, p_branch_contact_name text default null, p_branch_phone text default null,
  p_partner_slug text default null
) returns uuid
language plpgsql security definer set search_path to ''
as $function$
declare
  pid uuid; me uuid := auth.uid(); who text;
  ag_id uuid; br_id uuid; ag_new boolean := false; br_new boolean := false;
  v_admin boolean := public.is_admin();
  v_state text;
  v_slug text := nullif(btrim(coalesce(p_partner_slug,'')), '');
  v_slug_id uuid;
  v_branch text := coalesce(nullif(btrim(coalesce(p_branch,'')), ''), 'Head office');
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if btrim(coalesce(p_agency,'')) = '' then raise exception 'Agency is required' using errcode = '22023'; end if;
  who := coalesce((select full_name from public.users where id = me), 'a referrer');
  pid := public.app_partner();
  if pid is not null then
    v_state := 'pending_review';
    select id into ag_id from public.agencies where partner_id = pid and lower(name) = lower(btrim(p_agency)) limit 1;
  else
    if not v_admin then raise exception 'Not permitted.' using errcode = '42501'; end if;
    v_state := 'confirmed';
    if v_slug is not null then select id into v_slug_id from public.partners where slug = v_slug; end if;
    select a.id, a.partner_id into ag_id, pid
      from public.agencies a
      where lower(a.name) = lower(btrim(p_agency)) and (v_slug_id is null or a.partner_id = v_slug_id)
      order by (a.review_state = 'confirmed') desc, a.created_at asc limit 1;
    if ag_id is null then
      if v_slug is null then raise exception 'Select a specific partner before creating a new agency on the fly.' using errcode = '22023'; end if;
      if v_slug_id is null then raise exception 'Unknown partner.' using errcode = '22023'; end if;
      pid := v_slug_id;
    end if;
  end if;
  if ag_id is null then
    insert into public.agencies(name, partner_id, review_state, created_by)
    values (btrim(p_agency), pid, v_state, me) returning id into ag_id;
    ag_new := true;
    insert into public.org_audit(entity_type, entity_id, action, detail, actor, actor_id)
    values ('agency', ag_id, 'created', btrim(p_agency), who, me);
  end if;
  select id into br_id from public.branches where agency_id = ag_id and lower(name) = lower(v_branch) limit 1;
  if br_id is null then
    insert into public.branches(name, agency_id, partner_id, review_state, created_by)
    values (v_branch, ag_id, pid, v_state, me) returning id into br_id;
    br_new := true;
    insert into public.org_audit(entity_type, entity_id, action, detail, actor, actor_id)
    values ('branch', br_id, 'created', v_branch, who, me);
  end if;
  if ag_new and coalesce(btrim(p_agency_email),'') <> '' then
    insert into public.agent_contacts(agency_id, partner_id, name, email, phone, is_primary, created_by)
    values (ag_id, pid, btrim(coalesce(p_agency_contact_name,'')), btrim(p_agency_email), nullif(btrim(p_agency_phone),''), true, me);
  end if;
  if br_new and coalesce(btrim(p_branch_email),'') <> '' then
    insert into public.agent_contacts(branch_id, partner_id, name, email, phone, is_primary, created_by)
    values (br_id, pid, btrim(coalesce(p_branch_contact_name,'')), btrim(p_branch_email), nullif(btrim(p_branch_phone),''), true, me);
  end if;
  return br_id;
end $function$;

revoke all on function public.create_referral_target(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_referral_target(text, text, text, text, text, text, text, text, text) to authenticated;
