-- =====================================================================
-- HubSpot sync v1 — schema (config-not-code)
--
-- Portal -> HubSpot, one-way. An event-driven feed that consumes the
-- activity_log since a cursor, translates each lifecycle event through a
-- CONFIG mapping table (portal field -> HubSpot internal name), and upserts
-- Applicants / Companies / associations via the HubSpot v3/v4 APIs.
-- See HUBSPOT-SYNC-SPEC.md. Nothing here hard-codes a HubSpot object/pipeline/
-- stage/association id: those live in hubspot_sync_env as ACTIVE (sandbox) and
-- DORMANT (production) blocks — promotion is a config swap, not a deploy.
--
-- House style: idempotent DDL; every table RLS-on with NO policies (only the
-- service_role / SECURITY DEFINER paths touch it), mirroring stripe_events /
-- pandadoc_events / ops_secrets.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Environment constant blocks. One row per environment; exactly one
--    is_active. The ACTIVE row is read live from the sandbox Hub; the
--    DORMANT row carries the spec §2 production constants. Promotion =
--    flip is_active (a config swap).
-- ---------------------------------------------------------------------
create table if not exists public.hubspot_sync_env (
  env                       text primary key,                 -- 'sandbox' | 'production'
  is_active                 boolean not null default false,
  hub_id                    text not null,
  applicant_object_type     text not null,                    -- e.g. sandbox 2-205090657 / prod 2-203764825
  pipeline_id               text not null,
  stage_referred            text not null,
  stage_fee_paid            text not null,
  stage_deed_issued         text not null,
  stage_withdrawn           text not null,
  company_assoc_type_id     integer,                          -- applicant->company (unlabeled/primary-capable); §7 read live
  company_assoc_category    text not null default 'USER_DEFINED',
  company_parent_type_id    integer,                          -- child company -> parent company ("Parent Company")
  company_parent_category   text not null default 'HUBSPOT_DEFINED',
  app_base_url              text,                             -- base for the deed_download_url deep link
  notes                     text,
  updated_at                timestamptz not null default now()
);
-- At most one active environment.
create unique index if not exists hubspot_sync_env_one_active
  on public.hubspot_sync_env ((is_active)) where is_active;

alter table public.hubspot_sync_env enable row level security;
-- No policies: only service_role / SECURITY DEFINER paths touch this table.

-- ---------------------------------------------------------------------
-- 2. Field mapping (§3). portal fact -> HubSpot internal name, as DATA.
--    A property rename is a config edit, not a deploy.
--      source_kind: 'col'      -> applications.<source>  (optionally transformed)
--                   'const'    -> literal <source>
--                   'derived'  -> computed by the function (source is the logical key)
--                   'pipeline' -> active env.pipeline_id
--                   'stage'    -> active env stage id keyed by <source>
--                   'payment_status' -> literal option (validated against HubSpot options)
--                   'event'    -> a field of the activity_log event itself (e.g. 'at')
--      transform:   'date' | 'datetime' | 'number' | null
--      events:      which sync event(s) write this property
-- ---------------------------------------------------------------------
create table if not exists public.hubspot_field_map (
  id           bigint generated always as identity primary key,
  object       text not null,                                 -- 'applicant' | 'company'
  hs_property  text not null,                                 -- HubSpot internal property name
  source_kind  text not null,
  source       text not null,                                 -- column / const value / logical key / stage key
  transform    text,
  events       text[] not null default '{}',
  active       boolean not null default true,
  notes        text,
  unique (object, hs_property, source)
);

alter table public.hubspot_field_map enable row level security;
-- No policies: service_role only.

-- ---------------------------------------------------------------------
-- 3. Partner resolution (§3: "resolved once per partner at config time").
--    Maps a portal partner -> the value written to Applicant.partner_id and
--    the crm_company_key of the partner's HubSpot company (the PRIMARY
--    association target in §7).
-- ---------------------------------------------------------------------
create table if not exists public.hubspot_partner_map (
  partner_id           uuid primary key references public.partners(id) on delete cascade,
  partner_slug         text not null,
  hs_partner_id        text not null,                         -- Applicant.partner_id value + partner company's unique partner_id
  partner_company_key  text not null,                         -- crm_company_key of the partner company (Rightmove/Zoopla/…)
  active               boolean not null default true,
  updated_at           timestamptz not null default now()
);

alter table public.hubspot_partner_map enable row level security;
-- No policies: service_role only.

-- ---------------------------------------------------------------------
-- 4. Cursor (single row). Consume activity_log strictly after (last_at,last_id)
--    ordered by (at,id). Initialised to go-live so pre-existing test debris is
--    never synced (§9 no backfill: "the sync's first record is the trial's
--    first real referral").
-- ---------------------------------------------------------------------
create table if not exists public.hubspot_sync_cursor (
  id          boolean primary key default true,
  last_at     timestamptz not null,
  last_id     uuid,
  updated_at  timestamptz not null default now(),
  constraint hubspot_sync_cursor_singleton check (id)
);

alter table public.hubspot_sync_cursor enable row level security;
-- No policies: service_role only.

-- ---------------------------------------------------------------------
-- 5. Idempotency ledger (§1: "every sync action keys on (event id, target
--    record)"). Modelled on pandadoc_events / stripe_events: a text PK that
--    is claimed before the action and skipped on replay.
-- ---------------------------------------------------------------------
create table if not exists public.hubspot_sync_events (
  id              text primary key,                           -- '{activity_log_id}:{target}'
  event_id        uuid not null,
  target          text not null,                              -- 'applicant' | 'companies' | 'assoc'
  application_id  uuid,
  applied_at      timestamptz not null default now()
);
create index if not exists hubspot_sync_events_event_idx on public.hubspot_sync_events (event_id);

alter table public.hubspot_sync_events enable row level security;
-- No policies: service_role only.

-- ---------------------------------------------------------------------
-- 6. Fetch RPC: events strictly after the cursor, kind-filtered, joined to
--    their application, ordered (at,id). Row-value comparison keeps the
--    (at,id) watermark exact. SECURITY DEFINER, service_role only.
-- ---------------------------------------------------------------------
create or replace function public.hubspot_pending_events(
  p_last_at timestamptz, p_last_id uuid, p_kinds text[], p_limit int
) returns table(event_id uuid, kind text, at timestamptz, application_id uuid, app jsonb)
language sql security definer set search_path = '' as $$
  select al.id, al.kind, al.at, al.application_id, to_jsonb(a.*)
  from public.activity_log al
  join public.applications a on a.id = al.application_id
  where al.kind = any(p_kinds)
    and (al.at, al.id) > (p_last_at, coalesce(p_last_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by al.at asc, al.id asc
  limit p_limit
$$;
revoke execute on function public.hubspot_pending_events(timestamptz, uuid, text[], int) from public, anon, authenticated;
grant execute on function public.hubspot_pending_events(timestamptz, uuid, text[], int) to service_role;

-- ---------------------------------------------------------------------
-- 7. Org context RPC: everything company-sync needs for one application's
--    agency+branch in a single call (names, group, review_state, and the
--    confirmed-branch count that drives the single-office rule §6).
-- ---------------------------------------------------------------------
create or replace function public.hubspot_org_context(p_agency uuid, p_branch uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'agency', (select to_jsonb(a.*) from public.agencies a where a.id = p_agency),
    'branch', (select to_jsonb(b.*) from public.branches b where b.id = p_branch),
    'confirmed_branch_count',
      (select count(*) from public.branches b where b.agency_id = p_agency and b.review_state = 'confirmed'),
    'confirmed_branches',
      (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.created_at), '[]'::jsonb)
         from public.branches b where b.agency_id = p_agency and b.review_state = 'confirmed')
  )
$$;
revoke execute on function public.hubspot_org_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hubspot_org_context(uuid, uuid) to service_role;

comment on table public.hubspot_sync_env is 'HubSpot environment constant blocks (active sandbox + dormant production); promotion = flip is_active.';
comment on table public.hubspot_field_map is 'HubSpot §3 field mapping as config-not-code: portal fact -> HubSpot internal property name.';
comment on table public.hubspot_sync_cursor is 'HubSpot sync watermark over activity_log (at,id); initialised at go-live to prevent backfill (§9).';
comment on table public.hubspot_sync_events is 'HubSpot sync idempotency ledger keyed (event id, target) — pandadoc_events style.';
