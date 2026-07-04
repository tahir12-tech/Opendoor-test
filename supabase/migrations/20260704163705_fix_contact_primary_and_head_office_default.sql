-- ============================================================================
-- #67: make the contact RPCs cooperate with the existing agent_contacts
-- triggers (agent_contacts_maintain_primary demotes the old primary when a row
-- claims primary; agent_contacts_promote_on_delete promotes the oldest after a
-- primary is deleted; contacts_sync_partner sets partner_id). The previous
-- org_set_primary_contact updated ALL owner rows in one statement, which
-- collided with the demote trigger ("tuple to be updated was already modified
-- by an operation triggered by the current command"). Every RPC now touches a
-- single row per statement and lets the triggers maintain the invariant, so no
-- raw database error can surface.
--
-- #65: create_referral_target now defaults a blank branch to 'Head office' so a
-- single-office agent never has to invent a junk branch.
-- ============================================================================

-- ---- #67: contact RPCs, trigger-aware ----

create or replace function public.org_add_contact(
  p_agency_id uuid, p_branch_id uuid,
  p_name text, p_role text, p_email text, p_phone text, p_primary boolean default false
) returns uuid
language plpgsql security definer set search_path to ''
as $function$
declare me uuid := auth.uid(); pid uuid; new_id uuid; v_email text := btrim(coalesce(p_email,''));
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if (p_agency_id is null) = (p_branch_id is null) then
    raise exception 'A contact must belong to exactly one agency or branch.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name,'')) = '' or v_email = '' then
    raise exception 'Contact name and email are required.' using errcode = '22023';
  end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid contact email.' using errcode = '22023';
  end if;
  if p_agency_id is not null then select partner_id into pid from public.agencies where id = p_agency_id;
  else select partner_id into pid from public.branches where id = p_branch_id; end if;
  if pid is null then raise exception 'Owner not found.' using errcode = '22023'; end if;
  if not (public.is_admin() or (public.app_role() = 'management' and pid = public.app_partner())) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  -- The triggers own the invariant: contacts_sync_partner sets partner_id;
  -- agent_contacts_maintain_primary forces the first contact primary and demotes
  -- the previous primary when this row claims it.
  insert into public.agent_contacts(agency_id, branch_id, name, email, phone, contact_role, is_primary, created_by)
  values (p_agency_id, p_branch_id, btrim(p_name), v_email, nullif(btrim(coalesce(p_phone,'')),''), nullif(btrim(coalesce(p_role,'')),''), coalesce(p_primary,false), me)
  returning id into new_id;
  return new_id;
end $function$;

create or replace function public.org_update_contact(
  p_id uuid, p_name text, p_role text, p_email text, p_phone text, p_primary boolean
) returns void
language plpgsql security definer set search_path to ''
as $function$
declare pid uuid; a_id uuid; b_id uuid; v_email text := btrim(coalesce(p_email,'')); has_primary boolean;
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  select partner_id, agency_id, branch_id into pid, a_id, b_id from public.agent_contacts where id = p_id;
  if pid is null then raise exception 'Contact not found.' using errcode = '22023'; end if;
  if not (public.is_admin() or (public.app_role() = 'management' and pid = public.app_partner())) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name,'')) = '' or v_email = '' then
    raise exception 'Contact name and email are required.' using errcode = '22023';
  end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid contact email.' using errcode = '22023';
  end if;

  -- Single-row update: agent_contacts_maintain_primary demotes the previous
  -- primary when p_primary is true (no multi-row collision).
  update public.agent_contacts
    set name = btrim(p_name), email = v_email, phone = nullif(btrim(coalesce(p_phone,'')),''),
        contact_role = nullif(btrim(coalesce(p_role,'')),''), is_primary = coalesce(p_primary,false)
    where id = p_id;

  -- The trigger does NOT cover demote-to-zero (setting the sole primary false).
  -- Keep the owner with exactly one primary by promoting the oldest.
  select exists (select 1 from public.agent_contacts
    where ((a_id is not null and agency_id = a_id) or (b_id is not null and branch_id = b_id)) and is_primary) into has_primary;
  if not has_primary then
    update public.agent_contacts set is_primary = true where id = (
      select id from public.agent_contacts
      where (a_id is not null and agency_id = a_id) or (b_id is not null and branch_id = b_id)
      order by created_at asc, id asc limit 1);
  end if;
end $function$;

create or replace function public.org_remove_contact(p_id uuid) returns void
language plpgsql security definer set search_path to ''
as $function$
declare pid uuid;
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  select partner_id into pid from public.agent_contacts where id = p_id;
  if pid is null then raise exception 'Contact not found.' using errcode = '22023'; end if;
  if not (public.is_admin() or (public.app_role() = 'management' and pid = public.app_partner())) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  -- agent_contacts_promote_on_delete promotes the oldest remaining if the
  -- deleted contact was the owner's primary.
  delete from public.agent_contacts where id = p_id;
end $function$;

create or replace function public.org_set_primary_contact(p_id uuid) returns void
language plpgsql security definer set search_path to ''
as $function$
declare pid uuid;
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  select partner_id into pid from public.agent_contacts where id = p_id;
  if pid is null then raise exception 'Contact not found.' using errcode = '22023'; end if;
  if not (public.is_admin() or (public.app_role() = 'management' and pid = public.app_partner())) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  -- Single-row update; agent_contacts_maintain_primary demotes the old primary.
  update public.agent_contacts set is_primary = true where id = p_id;
end $function$;

-- ---- #65: default a blank on-the-fly branch to 'Head office' ----

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
  if btrim(coalesce(p_agency,'')) = '' then
    raise exception 'Agency is required' using errcode = '22023';
  end if;

  who := coalesce((select full_name from public.users where id = me), 'a referrer');
  pid := public.app_partner();

  if pid is not null then
    v_state := 'pending_review';
    select id into ag_id from public.agencies
      where partner_id = pid and lower(name) = lower(btrim(p_agency)) limit 1;
  else
    if not v_admin then
      raise exception 'Not permitted.' using errcode = '42501';
    end if;
    v_state := 'confirmed';
    if v_slug is not null then
      select id into v_slug_id from public.partners where slug = v_slug;
    end if;
    select a.id, a.partner_id into ag_id, pid
      from public.agencies a
      where lower(a.name) = lower(btrim(p_agency))
        and (v_slug_id is null or a.partner_id = v_slug_id)
      order by (a.review_state = 'confirmed') desc, a.created_at asc
      limit 1;
    if ag_id is null then
      if v_slug is null then
        raise exception 'Select a specific partner before creating a new agency on the fly.' using errcode = '22023';
      end if;
      if v_slug_id is null then
        raise exception 'Unknown partner.' using errcode = '22023';
      end if;
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

  select id into br_id from public.branches
    where agency_id = ag_id and lower(name) = lower(v_branch) limit 1;
  if br_id is null then
    insert into public.branches(name, agency_id, partner_id, review_state, created_by)
    values (v_branch, ag_id, pid, v_state, me) returning id into br_id;
    br_new := true;
    insert into public.org_audit(entity_type, entity_id, action, detail, actor, actor_id)
    values ('branch', br_id, 'created', v_branch, who, me);
  end if;

  if ag_new and coalesce(btrim(p_agency_email),'') <> '' then
    insert into public.agent_contacts(agency_id, partner_id, name, email, phone, is_primary, created_by)
    values (ag_id, pid, coalesce(nullif(btrim(p_agency_contact_name),''), btrim(p_agency_email)), btrim(p_agency_email), nullif(btrim(p_agency_phone),''), true, me);
  end if;

  if br_new and coalesce(btrim(p_branch_email),'') <> '' then
    insert into public.agent_contacts(branch_id, partner_id, name, email, phone, is_primary, created_by)
    values (br_id, pid, coalesce(nullif(btrim(p_branch_contact_name),''), btrim(p_branch_email)), btrim(p_branch_email), nullif(btrim(p_branch_phone),''), true, me);
  end if;

  return br_id;
end $function$;

revoke all on function public.create_referral_target(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_referral_target(text, text, text, text, text, text, text, text, text) to authenticated;
