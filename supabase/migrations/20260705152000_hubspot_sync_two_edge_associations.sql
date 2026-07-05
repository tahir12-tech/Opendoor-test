-- =====================================================================
-- HubSpot sync — owner ruling amendment (5 Jul 2026): TWO company edges
-- per applicant, superseding the three-role model in 20260705151000.
--
-- The applicant links to exactly two companies:
--   1. the partner company (Rightmove/Zoopla) — always, PRIMARY (unlabeled type,
--      via the v4 default-association endpoint) = company_assoc_type_id.
--   2. the referring agent's BRANCH company = company_branch_type_id.
--      Multi-branch group → the specific branch CHILD (not the group parent);
--      single-office agency → the single company plays the branch role.
-- Agency/group-level rollups traverse the branch->parent company link (§6), so
-- there is NO direct applicant->parent edge. Exactly two edges also fits the
-- sandbox's 2-companies-per-record association cap natively — the previous
-- "skip the third edge" warning path becomes the design, not a degradation.
--
-- The agency-role association columns are therefore dropped.
-- Also hardens hubspot_org_context: scope the branch fetch to its agency.
-- =====================================================================
alter table public.hubspot_sync_env drop column if exists company_agency_type_id;
alter table public.hubspot_sync_env drop column if exists company_agency_category;

-- The single agent/branch edge. 23 is a live sandbox label (read via the labels
-- endpoint); 19 remains the partner/primary (unlabeled) edge. Production reads its
-- own value at promotion (§7).
update public.hubspot_sync_env set company_branch_type_id = 23,  updated_at = now() where env = 'sandbox';
update public.hubspot_sync_env set company_branch_type_id = null, updated_at = now() where env = 'production';

-- Harden org context: a mismatched branch_id must not be trusted across agencies.
create or replace function public.hubspot_org_context(p_agency uuid, p_branch uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'agency', (select to_jsonb(a.*) from public.agencies a where a.id = p_agency),
    'branch', (select to_jsonb(b.*) from public.branches b where b.id = p_branch and b.agency_id = p_agency),
    'confirmed_branch_count',
      (select count(*) from public.branches b where b.agency_id = p_agency and b.review_state = 'confirmed'),
    'confirmed_branches',
      (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.created_at), '[]'::jsonb)
         from public.branches b where b.agency_id = p_agency and b.review_state = 'confirmed')
  )
$$;
revoke execute on function public.hubspot_org_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hubspot_org_context(uuid, uuid) to service_role;
