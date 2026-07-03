/* =====================================================================
   Seed agencies + branches (ported from portal-org.js).
   Every agency is stamped to a partner. The same name under two partners
   would be two separate records.
   ===================================================================== */
import type { Agency } from '../types';

export const ORG_SEED: Agency[] = [
  { partner: 'rightmove', name: 'Foxglove Residential', group: 'ABC group', users: 11, referrals: 214, guaranteed: '£3.9M', fees: 385000, open: true,
    contacts: [{ name: 'Eleanor Whitfield', email: 'guarantees@foxglove-residential.co.uk', phone: '020 7946 1100', role: 'Lettings operations', primary: true }],
    branches: [
      { name: 'South Kensington', area: 'SW7', referrers: 5, referrals: 78, guaranteed: '£1.4M', fees: 165000, contacts: [{ name: 'Priya Nair', email: 'sthken@foxglove-residential.co.uk', phone: '020 7946 1120', role: 'Branch manager', primary: true }] },
      { name: 'Chelsea', area: 'SW3', referrers: 4, referrals: 61, guaranteed: '£1.2M', fees: 129000 },
      { name: 'Fulham', area: 'SW6', referrers: 2, referrals: 43, guaranteed: '£0.8M', fees: 91000 },
    ] },
  { partner: 'rightmove', name: 'Marylebone & Co', users: 8, referrals: 152, guaranteed: '£3.1M', fees: 266000,
    contacts: [{ name: 'Daniel Wright', email: 'deeds@maryleboneandco.co.uk', phone: '020 7946 1200', role: 'Compliance', primary: true }],
    branches: [
      { name: 'Marylebone', area: 'W1U', referrers: 3, referrals: 72, guaranteed: '£1.6M', fees: 152000 },
      { name: 'Fitzrovia', area: 'W1T', referrers: 3, referrals: 54, guaranteed: '£1.1M', fees: 114000 },
    ] },
  { partner: 'rightmove', name: 'Hartwell Estates', users: 5, referrals: 96, guaranteed: '£1.8M', fees: 202000, branches: [
    { name: 'Clapham', area: 'SW11', referrers: 3, referrals: 58, guaranteed: '£1.1M', fees: 122000 },
    { name: 'Balham', area: 'SW12', referrers: 2, referrals: 38, guaranteed: '£0.7M', fees: 80000 },
  ] },
  { partner: 'rightmove', name: 'Northbank Lettings', users: 6, referrals: 108, guaranteed: '£2.0M', fees: 227000, branches: [
    { name: 'Shoreditch', area: 'EC2A', referrers: 3, referrals: 63, guaranteed: '£1.2M', fees: 132000 },
    { name: 'Islington', area: 'N1', referrers: 3, referrals: 45, guaranteed: '£0.8M', fees: 95000 },
  ] },
  { partner: 'zoopla', name: 'Cityscape Lettings', users: 4, referrals: 54, guaranteed: '£1.0M', fees: 64000, branches: [
    { name: 'Battersea', area: 'SW11', referrers: 2, referrals: 31, guaranteed: '£0.6M', fees: 38000 },
    { name: 'Noho', area: 'W1W', referrers: 2, referrals: 23, guaranteed: '£0.4M', fees: 26000 },
  ] },
  { partner: 'zoopla', name: 'Riverside Homes', users: 2, referrals: 18, guaranteed: '£0.3M', fees: 21000, branches: [
    { name: 'Bermondsey', area: 'SE1', referrers: 2, referrals: 18, guaranteed: '£0.3M', fees: 21000 },
  ] },
  { partner: 'onthemarket', name: 'Northgate Property', users: 3, referrals: 26, guaranteed: '£0.5M', fees: 31000, branches: [
    { name: 'Stoke Newington', area: 'N16', referrers: 2, referrals: 15, guaranteed: '£0.3M', fees: 18000 },
    { name: 'Deptford', area: 'SE8', referrers: 1, referrals: 11, guaranteed: '£0.2M', fees: 13000 },
  ] },
];
