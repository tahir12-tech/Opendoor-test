/* =====================================================================
   In-force guarantees approaching expiry (mock).
   These are older guarantees (issued roughly a year ago) whose cover is now
   lapsing, so the Activity page can show the 7 / 14 / 30 day urgency bands.
   The recent referrals in portal-apps expire about a year out, so they are
   not "approaching"; these represent the earlier cohort now nearing expiry.

   Each carries the tenancy start date only; the expiry is always derived with
   guaranteeExpiry (tenancy start + 12 months - 1 day), never stored.
   ===================================================================== */

export interface UpcomingGuaranteeSeed {
  ref: string;
  tenant: string;
  prop: string;
  branch: string;
  agency: string;
  partner: string;
  /** 1 when owned by the demo referrer (for referrer scoping). */
  owner: number;
  /** Tenancy start date, ISO yyyy-mm-dd. */
  tenancyStart: string;
}

// Tenancy starts are chosen against the demo "today" (26/06/2026) so the
// derived expiries spread across the urgency bands.
export const UPCOMING_GUARANTEES: UpcomingGuaranteeSeed[] = [
  { ref: 'GR-19001', tenant: 'Amara Osei', prop: 'Flat 2, 12 Coleridge Gardens, NW6', branch: 'South Kensington', agency: 'Foxglove Residential', partner: 'rightmove', owner: 1, tenancyStart: '2025-06-29' },
  { ref: 'GR-19008', tenant: 'Ben Carter', prop: '8 Lonsdale Road, SW13', branch: 'Chelsea', agency: 'Foxglove Residential', partner: 'rightmove', owner: 0, tenancyStart: '2025-07-02' },
  { ref: 'GR-19064', tenant: 'Jack Turner', prop: '23 Balham High Road, SW12', branch: 'Balham', agency: 'Hartwell Estates', partner: 'rightmove', owner: 0, tenancyStart: '2025-07-04' },
  { ref: 'GR-19015', tenant: 'Chloe Fenwick', prop: '44 Elgin Avenue, W9', branch: 'Marylebone', agency: 'Marylebone & Co', partner: 'rightmove', owner: 0, tenancyStart: '2025-07-06' },
  { ref: 'GR-19022', tenant: 'Dev Sharma', prop: '3 Hazlitt Road, W14', branch: 'South Kensington', agency: 'Foxglove Residential', partner: 'rightmove', owner: 1, tenancyStart: '2025-07-10' },
  { ref: 'GR-19050', tenant: 'Hassan Ali', prop: '14 Lavender Hill, SW11', branch: 'Battersea', agency: 'Cityscape Lettings', partner: 'zoopla', owner: 0, tenancyStart: '2025-07-14' },
  { ref: 'GR-19029', tenant: 'Elena Popova', prop: '19 Barnsbury Street, N1', branch: 'Islington', agency: 'Northbank Lettings', partner: 'rightmove', owner: 0, tenancyStart: '2025-07-18' },
  { ref: 'GR-19036', tenant: 'Femi Adebayo', prop: '27 Northcote Road, SW11', branch: 'Clapham', agency: 'Hartwell Estates', partner: 'rightmove', owner: 1, tenancyStart: '2025-07-25' },
  { ref: 'GR-19043', tenant: 'Grace Lim', prop: '5 Deptford High Street, SE8', branch: 'Deptford', agency: 'Northgate Property', partner: 'onthemarket', owner: 0, tenancyStart: '2025-08-10' },
  { ref: 'GR-19057', tenant: 'Iris Bergman', prop: '9 Mortimer Street, W1W', branch: 'Noho', agency: 'Cityscape Lettings', partner: 'zoopla', owner: 0, tenancyStart: '2025-08-27' },
];
