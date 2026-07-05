-- =====================================================================
-- HubSpot sync v1 — config seed
--
-- ACTIVE block = the SANDBOX (Hub 148836842), read live from the Hub on
-- 5 Jul 2026 via the connected MCP / CRM API:
--   applicants object  2-205090657   (NB: differs from prod 2-203764825)
--   pipeline           3897733314    "Rightmove Trial pipeline"
--   stages             Referred 5551028464 · Fee Paid 5552384196 ·
--                      Deed Issued 5552384197 · Withdrawn 5552384198
--   applicant->company assoc typeId 19 (unlabeled/primary-capable, USER_DEFINED)
--   company parent link typeId 14 ("Parent Company", HUBSPOT_DEFINED)
-- DORMANT block = PRODUCTION spec §2 (Hub 144519077). Promotion = flip
-- is_active. The prod applicant->company assoc typeId is intentionally NULL:
-- it is the one id not in the spec (§7) and must be read live before promotion.
-- =====================================================================

insert into public.hubspot_sync_env
  (env, is_active, hub_id, applicant_object_type, pipeline_id,
   stage_referred, stage_fee_paid, stage_deed_issued, stage_withdrawn,
   company_assoc_type_id, company_assoc_category, company_parent_type_id, company_parent_category,
   app_base_url, notes)
values
  ('sandbox', true, '148836842', '2-205090657', '3897733314',
   '5551028464', '5552384196', '5552384197', '5552384198',
   19, 'USER_DEFINED', 14, 'HUBSPOT_DEFINED',
   'https://app.opndoor.co', 'ACTIVE. Read live from sandbox Hub 148836842 on 2026-07-05.'),
  ('production', false, '144519077', '2-203764825', '3897733314',
   '5551028464', '5552384196', '5552384197', '5552384198',
   null, 'USER_DEFINED', 14, 'HUBSPOT_DEFINED',
   'https://app.opndoor.co', 'DORMANT. Spec §2 constants. company_assoc_type_id must be read live (§7) before promotion.')
on conflict (env) do update set
  is_active = excluded.is_active,
  hub_id = excluded.hub_id,
  applicant_object_type = excluded.applicant_object_type,
  pipeline_id = excluded.pipeline_id,
  stage_referred = excluded.stage_referred,
  stage_fee_paid = excluded.stage_fee_paid,
  stage_deed_issued = excluded.stage_deed_issued,
  stage_withdrawn = excluded.stage_withdrawn,
  company_assoc_type_id = excluded.company_assoc_type_id,
  company_assoc_category = excluded.company_assoc_category,
  company_parent_type_id = excluded.company_parent_type_id,
  company_parent_category = excluded.company_parent_category,
  app_base_url = excluded.app_base_url,
  notes = excluded.notes,
  updated_at = now();

-- ---------------------------------------------------------------------
-- §3 Applicant field map (portal fact -> HubSpot internal name), as data.
-- ---------------------------------------------------------------------
insert into public.hubspot_field_map (object, hs_property, source_kind, source, transform, events, notes) values
  ('applicant','applicant_id','col','guarantee_ref',null,'{referral}','Upsert key (GR-xxxxx)'),
  ('applicant','tenant_title','col','tenant_title',null,'{referral}','Options incl. Mx (present in sandbox)'),
  ('applicant','first_name','col','tenant_first_name',null,'{referral}',null),
  ('applicant','last_name','col','tenant_last_name',null,'{referral}',null),
  ('applicant','full_name','derived','full_name',null,'{referral}','first + last'),
  ('applicant','dob','col','tenant_dob','date','{referral}',null),
  ('applicant','email','col','tenant_email',null,'{referral}',null),
  ('applicant','phone_number','col','tenant_phone',null,'{referral}',null),
  ('applicant','property_address_line_1','col','prop_addr1',null,'{referral}',null),
  ('applicant','property_address_line_2','col','prop_addr2',null,'{referral}',null),
  ('applicant','citytown','col','prop_city',null,'{referral}',null),
  ('applicant','county','col','prop_county',null,'{referral}',null),
  ('applicant','postcode','col','prop_postcode',null,'{referral}',null),
  ('applicant','monthly_rent','col','monthly_rent','number','{referral}',null),
  ('applicant','tenancy_start_date','col','tenancy_start','date','{referral,tenancy_amend}','expiry recalculates itself'),
  ('applicant','referral_received_date','col','sent_at','datetime','{referral}',null),
  ('applicant','payment_link_url','col','payment_url',null,'{referral}','checkout URL'),
  ('applicant','channel','const','Partner Referral',null,'{referral}','Owner-ruled constant'),
  ('applicant','tenant_role','const','Tenant',null,'{referral}','Portal has no joint-tenant concept'),
  ('applicant','applicant_commission_rate','col','agent_rate','number','{referral}','Snapshotted rate, never current partner rate'),
  ('applicant','partner_id','derived','partner_id',null,'{referral}','From partner map'),
  ('applicant','agency_reference_number','derived','agency_ref',null,'{referral}','Associated company crm_company_key'),
  ('applicant','hs_pipeline','pipeline','pipeline',null,'{referral}','Constant per env'),
  ('applicant','hs_pipeline_stage','stage','referred',null,'{referral}',null),
  ('applicant','hs_pipeline_stage','stage','fee_paid',null,'{fee_paid}',null),
  ('applicant','hs_pipeline_stage','stage','deed_issued',null,'{deed_issued}',null),
  ('applicant','hs_pipeline_stage','stage','withdrawn',null,'{withdrawn}','terminal'),
  ('applicant','payment_status','payment_status','Pending',null,'{referral}',null),
  ('applicant','payment_status','payment_status','Paid',null,'{fee_paid}',null),
  ('applicant','payment_status','payment_status','Refunded',null,'{refund}','Refund: payment_status only, stage untouched'),
  ('applicant','fee_paid','col','paid_amount','number','{fee_paid}',null),
  ('applicant','stripe_payment_id','col','stripe_payment_intent_id',null,'{fee_paid}',null),
  ('applicant','pandadoc_document_id','col','pandadoc_document_id',null,'{deed_issued}',null),
  ('applicant','deed_download_url','derived','deed_url',null,'{deed_issued}','Portal secure deed deep link'),
  ('applicant','guarantee_issued','col','issue_date','date','{deed_issued}','Feeds guarantee_expiry; never write expiry'),
  ('applicant','delivered_at','event','at','datetime','{delivered}','Deed-delivery event timestamp'),
  ('applicant','delivered_to','derived','delivered_to',null,'{delivered}','Claim-contact email actually sent to')
on conflict (object, hs_property, source) do update set
  source_kind = excluded.source_kind, transform = excluded.transform,
  events = excluded.events, notes = excluded.notes, active = true;

-- ---------------------------------------------------------------------
-- §6 Company property-name map (config for renames; values computed in code).
-- ---------------------------------------------------------------------
insert into public.hubspot_field_map (object, hs_property, source_kind, source, transform, events, notes) values
  ('company','crm_company_key','derived','company_key',null,'{}','RFL:{first 8 of portal UUID}'),
  ('company','name','derived','company_name',null,'{}',null),
  ('company','agency_name','derived','agency_name',null,'{}',null),
  ('company','branch_name','derived','branch_name',null,'{}',null),
  ('company','company_level','derived','company_level',null,'{}','Group HQ / Brand | Branch'),
  ('company','head_office_','derived','head_office',null,'{}','Yes | No'),
  ('company','network_group','derived','network_group',null,'{}','portal Group/network -> parent layer')
on conflict (object, hs_property, source) do update set
  source_kind = excluded.source_kind, notes = excluded.notes, active = true;

-- ---------------------------------------------------------------------
-- §3/§7 Partner resolution. Rightmove is the trial partner (its company is a
-- fixture in HubSpot). Others seeded for completeness; their companies are
-- minted/created at their own go-live.
-- ---------------------------------------------------------------------
insert into public.hubspot_partner_map (partner_id, partner_slug, hs_partner_id, partner_company_key)
select id, slug, slug, 'PARTNER:' || slug from public.partners
on conflict (partner_id) do update set
  partner_slug = excluded.partner_slug, hs_partner_id = excluded.hs_partner_id,
  partner_company_key = excluded.partner_company_key, active = true, updated_at = now();

-- ---------------------------------------------------------------------
-- Cursor: initialise to go-live (now) so pre-existing test debris is never
-- synced (§9). Only inserted once; never rewound by re-running the seed.
-- ---------------------------------------------------------------------
insert into public.hubspot_sync_cursor (id, last_at, last_id)
values (true, now(), null)
on conflict (id) do nothing;
