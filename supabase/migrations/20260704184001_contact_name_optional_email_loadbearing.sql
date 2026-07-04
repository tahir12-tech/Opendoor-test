-- #72/#69: the email is the load-bearing contact field; the NAME is optional.
-- Allow an empty name (so email-only contacts save) and stop writing the email
-- into the name column when the name is blank (which made lists show
-- "email · email"). Displays fall back to the email when the name is empty.
alter table public.agent_contacts drop constraint if exists agent_contacts_name_present;

-- org_add_contact: require only the email; store the name as given (may be '').
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
  if v_email = '' then raise exception 'A contact email is required.' using errcode = '22023'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid contact email.' using errcode = '22023';
  end if;
  if p_agency_id is not null then select partner_id into pid from public.agencies where id = p_agency_id;
  else select partner_id into pid from public.branches where id = p_branch_id; end if;
  if pid is null then raise exception 'Owner not found.' using errcode = '22023'; end if;
  if not (public.is_admin() or (public.app_role() = 'management' and pid = public.app_partner())) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  insert into public.agent_contacts(agency_id, branch_id, name, email, phone, contact_role, is_primary, created_by)
  values (p_agency_id, p_branch_id, btrim(coalesce(p_name,'')), v_email, nullif(btrim(coalesce(p_phone,'')),''), nullif(btrim(coalesce(p_role,'')),''), coalesce(p_primary,false), me)
  returning id into new_id;
  return new_id;
end $function$;

-- org_update_contact: require only the email; store the name as given (may be '').
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
  if v_email = '' then raise exception 'A contact email is required.' using errcode = '22023'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid contact email.' using errcode = '22023';
  end if;
  update public.agent_contacts
    set name = btrim(coalesce(p_name,'')), email = v_email, phone = nullif(btrim(coalesce(p_phone,'')),''),
        contact_role = nullif(btrim(coalesce(p_role,'')),''), is_primary = coalesce(p_primary,false)
    where id = p_id;
  select exists (select 1 from public.agent_contacts
    where ((a_id is not null and agency_id = a_id) or (b_id is not null and branch_id = b_id)) and is_primary) into has_primary;
  if not has_primary then
    update public.agent_contacts set is_primary = true where id = (
      select id from public.agent_contacts
      where (a_id is not null and agency_id = a_id) or (b_id is not null and branch_id = b_id)
      order by created_at asc, id asc limit 1);
  end if;
end $function$;

-- Stop storing the email as the name when the name is blank (#69 root), in the
-- three on-the-fly/admin creators. Displays fall back to the email.
create or replace function public.admin_add_agency(
  p_name text, p_group text default null, p_partner_slug text default null,
  p_contact_email text default null, p_contact_name text default null, p_contact_phone text default null
) returns uuid
language plpgsql security definer set search_path to ''
as $function$
declare
  me uuid := auth.uid(); who text; pid uuid; ag_id uuid;
  v_admin boolean := public.is_admin();
  v_state text; v_slug text := nullif(btrim(coalesce(p_partner_slug,'')),''); v_email text := btrim(coalesce(p_contact_email,''));
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if not (v_admin or public.app_role() = 'management') then raise exception 'Not permitted.' using errcode = '42501'; end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'Agency name is required' using errcode = '22023'; end if;
  if v_email = '' then raise exception 'An agency contact email is required.' using errcode = '22023'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid agency contact email.' using errcode = '22023'; end if;
  pid := public.app_partner();
  if pid is null then
    if v_slug is null then raise exception 'Select a specific partner before adding an agency.' using errcode = '22023'; end if;
    select id into pid from public.partners where slug = v_slug;
    if pid is null then raise exception 'Unknown partner.' using errcode = '22023'; end if;
  end if;
  v_state := case when v_admin then 'confirmed' else 'pending_review' end;
  if exists (select 1 from public.agencies where partner_id = pid and lower(name) = lower(btrim(p_name))) then
    raise exception 'An agency with that name already exists for this partner.' using errcode = '23505';
  end if;
  who := coalesce((select full_name from public.users where id = me), 'an administrator');
  insert into public.agencies(name, group_name, partner_id, review_state, created_by)
  values (btrim(p_name), nullif(btrim(coalesce(p_group,'')),''), pid, v_state, me) returning id into ag_id;
  insert into public.org_audit(entity_type, entity_id, action, detail, actor, actor_id)
  values ('agency', ag_id, 'created', btrim(p_name), who, me);
  insert into public.agent_contacts(agency_id, partner_id, name, email, phone, is_primary, created_by)
  values (ag_id, pid, btrim(coalesce(p_contact_name,'')), v_email, nullif(btrim(p_contact_phone),''), true, me);
  return ag_id;
end $function$;

create or replace function public.admin_add_branch(
  p_agency_id uuid, p_name text, p_area text default null,
  p_contact_email text default null, p_contact_name text default null, p_contact_phone text default null
) returns uuid
language plpgsql security definer set search_path to ''
as $function$
declare
  me uuid := auth.uid(); who text; pid uuid; br_id uuid; v_admin boolean := public.is_admin(); v_state text; v_email text := btrim(coalesce(p_contact_email,''));
begin
  if not public.is_aal2() then raise exception 'MFA required' using errcode = '42501'; end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'Branch name is required' using errcode = '22023'; end if;
  select partner_id into pid from public.agencies where id = p_agency_id;
  if pid is null then raise exception 'Agency not found.' using errcode = '22023'; end if;
  if not (v_admin or (public.app_role() = 'management' and pid = public.app_partner())) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if v_email <> '' and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid branch contact email, or leave it blank.' using errcode = '22023';
  end if;
  v_state := case when v_admin then 'confirmed' else 'pending_review' end;
  if exists (select 1 from public.branches where agency_id = p_agency_id and lower(name) = lower(btrim(p_name))) then
    raise exception 'A branch with that name already exists for this agency.' using errcode = '23505';
  end if;
  who := coalesce((select full_name from public.users where id = me), 'an administrator');
  insert into public.branches(name, agency_id, partner_id, area, review_state, created_by)
  values (btrim(p_name), p_agency_id, pid, nullif(btrim(coalesce(p_area,'')),''), v_state, me) returning id into br_id;
  insert into public.org_audit(entity_type, entity_id, action, detail, actor, actor_id)
  values ('branch', br_id, 'created', btrim(p_name), who, me);
  if v_email <> '' then
    insert into public.agent_contacts(branch_id, partner_id, name, email, phone, is_primary, created_by)
    values (br_id, pid, btrim(coalesce(p_contact_name,'')), v_email, nullif(btrim(p_contact_phone),''), true, me);
  end if;
  return br_id;
end $function$;
