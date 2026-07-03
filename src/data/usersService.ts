/* =====================================================================
   Users service.
   Enforces the visibility rules: opndoor admin accounts never appear in a
   partner user list; the opndoor team view shows only opndoor staff;
   Management sees only its own partner. Held in memory (the prototype did
   not persist users), so it resets on reload.

   INTEGRATION: getUsers -> GET /users with scope/team; addUser, updateRole,
   reset password, reset 2FA, resend invite and deactivate -> the matching
   mutations. Every rule here must also be enforced server-side.
   ===================================================================== */
import type { Role, User, UserStatus } from './types';
import { ALL_PARTNERS } from './types';
import { getSelectedPartner, homePartner, partnerName } from './partnersService';

// [name, role, lastActive, status, partner] — ported from user-management.html
const SEED: [string, Role, string, UserStatus, string][] = [
  ['Maya Holloway', 'superadmin', '2 minutes ago', 'active', 'opndoor'],
  ['Tom Sefton', 'management', '1 hour ago', 'active', 'rightmove'],
  ['Priya Nair', 'referrer', '12 minutes ago', 'active', 'rightmove'],
  ['James Okafor', 'referrer', 'Yesterday', 'active', 'rightmove'],
  ['Sophie Bennett', 'referrer', '3 hours ago', 'active', 'rightmove'],
  ['Rachel Adeyemi', 'management', 'Yesterday', 'active', 'rightmove'],
  ['Daniel Wright', 'referrer', '2 days ago', 'active', 'rightmove'],
  ['Aisha Khan', 'referrer', '5 hours ago', 'active', 'rightmove'],
  ['Marcus Lin', 'referrer', '1 day ago', 'active', 'rightmove'],
  ['Eleanor Voss', 'management', '4 days ago', 'active', 'rightmove'],
  ['Oliver Grant', 'referrer', '6 hours ago', 'active', 'rightmove'],
  ['Naomi Clarke', 'referrer', 'Pending invite', 'pending', 'rightmove'],
  ['Greg Mason', 'management', 'Yesterday', 'active', 'zoopla'],
  ['Hannah Pryce', 'referrer', '2 days ago', 'active', 'zoopla'],
  ['Owen Black', 'management', '3 days ago', 'active', 'onthemarket'],
  ['Ruth Findlay', 'referrer', '1 week ago', 'active', 'onthemarket'],
];

export interface ManagedUser extends User {
  id: string;
}

let USERS: ManagedUser[] = SEED.map((u, i) => ({ id: `u${i}`, name: u[0], role: u[1], lastActive: u[2], status: u[3], partner: u[4] }));

/** Replace the users working copy from the back end (Supabase mode). */
export function hydrateUsers(users: ManagedUser[]): void {
  USERS = users.slice();
}

export function emailOf(name: string): string {
  return `${name.toLowerCase().replace(/ /g, '.')}@brackenhouse.co.uk`;
}

export interface GetUsersOpts {
  viewer: Role;
  /** true for the ?team=opndoor view (opndoor admin only). */
  team: boolean;
  /** opndoor admin's selected partner scope; defaults to the persisted selection. */
  scope?: string;
}

/** Users visible to the viewer, following the partner-isolation and team rules. */
export function getUsers(opts: GetUsersOpts): ManagedUser[] {
  const scope = opts.viewer === 'superadmin' ? opts.scope ?? getSelectedPartner() : homePartner();
  return USERS.filter((u) => {
    if (opts.team) return u.role === 'superadmin'; // opndoor team: opndoor's own staff only
    if (u.role === 'superadmin') return false; // partner lists never include opndoor staff
    if (opts.viewer === 'management' && u.partner !== homePartner()) return false;
    if (opts.viewer === 'superadmin' && scope !== ALL_PARTNERS && u.partner !== scope) return false;
    return true;
  });
}

export function updateUserRole(id: string, role: Role): ManagedUser | null {
  const u = USERS.find((x) => x.id === id);
  if (!u) return null;
  u.role = role;
  return u;
}

export function deactivateUser(id: string): ManagedUser | null {
  const u = USERS.find((x) => x.id === id);
  if (!u) return null;
  u.status = 'pending';
  u.lastActive = 'Deactivated';
  return u;
}

export interface AddUserInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  partner: string;
}

export function addUser(input: AddUserInput): ManagedUser {
  const name = `${input.firstName || 'New'} ${input.lastName || 'User'}`;
  const partner = input.role === 'superadmin' ? 'opndoor' : input.partner || homePartner();
  const rec: ManagedUser = { id: `u${USERS.length}_${Math.round(performance.now())}`, name, role: input.role, lastActive: 'Pending invite', status: 'pending', partner };
  USERS.push(rec);
  return rec;
}

/** Display name of a user's partner (or "opndoor"). */
export function userPartnerName(partner: string): string {
  return partner === 'opndoor' ? 'opndoor' : partnerName(partner);
}
