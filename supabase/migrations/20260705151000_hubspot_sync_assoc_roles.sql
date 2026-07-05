-- =====================================================================
-- HubSpot sync — distinct association types per role (§7)
--
-- The sandbox's applicant->company association typeId 19 (unlabeled) is capped
-- at 2 associated companies per record, so partner+agency+branch cannot all ride
-- it. The sandbox exposes three association types (read live via
-- GET /crm/v4/associations/2-205090657/companies/labels): 19 (unlabeled,
-- primary-capable), 23 ("Tenants"), 21 ("Integration Tenants"). We map the three
-- §7 roles onto three distinct types via config:
--   partner -> 19 (primary, the one Workflow E reads)
--   agency  -> 23
--   branch  -> 21
-- Production note: create/rename labels to Partner/Agency/Branch and update the
-- two columns below at promotion (a one-line config change, §7/§10 style).
-- =====================================================================
alter table public.hubspot_sync_env
  add column if not exists company_agency_type_id  integer,
  add column if not exists company_agency_category text not null default 'USER_DEFINED',
  add column if not exists company_branch_type_id  integer,
  add column if not exists company_branch_category text not null default 'USER_DEFINED';

update public.hubspot_sync_env set
  company_agency_type_id = 23, company_agency_category = 'USER_DEFINED',
  company_branch_type_id = 21, company_branch_category = 'USER_DEFINED',
  updated_at = now()
where env = 'sandbox';

-- Production: agency/branch association type ids are read live before promotion
-- (same as company_assoc_type_id, §7). Left null while dormant.
update public.hubspot_sync_env set
  company_agency_type_id = null, company_branch_type_id = null, updated_at = now()
where env = 'production';
