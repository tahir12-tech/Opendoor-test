/* =====================================================================
   Agencies & branches — the partner organisation hierarchy. Expandable
   agencies, live search with highlighting, drill-through figures to the
   applications behind them, the add-agency/add-branch modals, the
   Management-only commission columns (per-partner rates), and the opndoor
   admin partner selector. View for all roles; canonical editing is admin.
   ===================================================================== */
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ALL_PARTNERS, addAgency, addBranch, addContact, effectivePrimary, findAgency, getAgencies, getPartners,
  getRatesFor, removeContact, setPrimaryContact, updateContact,
  type Agency, type AgentContact, type Branch,
} from '@/data';
import { useSession } from '@/session/SessionContext';
import { usePageMeta } from '@/components/layout/pageMeta';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PartnerSelect } from '@/components/ui/Select';
import './OrgManagement.css';

const agencyId = (a: Agency) => `${a.partner || 'rightmove'}:${a.name}`;

function highlight(name: string, q: string): ReactNode {
  if (!q) return name;
  const i = name.toLowerCase().indexOf(q);
  if (i === -1) return name;
  return (
    <>
      {name.slice(0, i)}
      <mark className="hl">{name.slice(i, i + q.length)}</mark>
      {name.slice(i + q.length)}
    </>
  );
}

function feesOf(item: Agency | Branch, isAgency: boolean): number {
  if (item.fees != null) return item.fees;
  if (isAgency && (item as Agency).branches) return (item as Agency).branches.reduce((s, b) => s + feesOf(b, false), 0);
  return Math.round((item.referrals || 0) * 0.78 * 2180);
}
function fmtK(n: number): string {
  if (n >= 1e6) return `£${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `£${Math.round(n / 1e3)}k`;
  return `£${Math.round(n)}`;
}

const goIcon = <span className="statlink__go"><Icon name="arrowRight" strokeWidth={2.2} /></span>;
const ctInitials = (n: string) => n.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/** The effective-primary-contact summary line shown under an agency or branch name. */
function ContactSummary({ agency, branch, canManage, onManage }: { agency: Agency; branch: Branch | null; canManage: boolean; onManage: () => void }) {
  const ep = effectivePrimary(agency, branch);
  const manageBtn = canManage ? (
    <button className="contact-manage" onClick={(e) => { e.stopPropagation(); onManage(); }}>Manage</button>
  ) : null;
  if (!ep.contact) {
    return <div className="contact-line"><Icon name="mail" /><span className="cl-none">No agent contact</span>{manageBtn}</div>;
  }
  return (
    <div className="contact-line">
      <Icon name="mail" />
      <span><b>{ep.contact.name}</b> · {ep.contact.email}</span>
      {branch && ep.inherited && <span className="cl-inherit">(agency default)</span>}
      {manageBtn}
    </div>
  );
}

export function OrgManagement() {
  usePageMeta('org', 'Agencies & branches', ['Home', 'Administration', 'Agencies & branches']);
  const { role, partnerScope, selectedPartner, setSelectedPartner } = useSession();

  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [query, setQuery] = useState('');
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(getAgencies(ALL_PARTNERS).filter((a) => a.open).map(agencyId)));

  // add-agency modal
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [agencyGroup, setAgencyGroup] = useState('');
  // add-branch modal
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchArea, setBranchArea] = useState('');
  const [branchAgency, setBranchAgency] = useState('');

  // contacts modal (agent contacts on an agency or branch). Editable by Management too.
  const canManageContacts = role === 'superadmin' || role === 'management';
  const [ctOpen, setCtOpen] = useState(false);
  const [ctAgencyName, setCtAgencyName] = useState('');
  const [ctBranchName, setCtBranchName] = useState<string | null>(null);
  const [ctEditIndex, setCtEditIndex] = useState<number | null>(null);
  const [ctName, setCtName] = useState('');
  const [ctRole, setCtRole] = useState('');
  const [ctEmail, setCtEmail] = useState('');
  const [ctPhone, setCtPhone] = useState('');
  const [ctPrimary, setCtPrimary] = useState(false);

  const rates = getRatesFor(partnerScope);
  const isMgmt = role === 'management';
  const q = query.trim().toLowerCase();
  const pool = getAgencies(partnerScope);

  const partnerPoolForBranch = getAgencies(partnerScope);

  // Resolve the contacts-modal owner fresh each render (reflects mutations).
  const ctAgency = ctOpen ? findAgency(ctAgencyName) ?? null : null;
  const ctBranch = ctBranchName && ctAgency ? ctAgency.branches.find((b) => b.name === ctBranchName) ?? null : null;
  const ctContacts: AgentContact[] = (ctBranchName ? ctBranch?.contacts : ctAgency?.contacts) ?? [];

  function openContacts(agencyName: string, branchName: string | null) {
    setCtAgencyName(agencyName);
    setCtBranchName(branchName);
    resetContactForm();
    setCtOpen(true);
  }
  function resetContactForm() {
    setCtEditIndex(null);
    setCtName('');
    setCtRole('');
    setCtEmail('');
    setCtPhone('');
    setCtPrimary(false);
  }
  function submitContact() {
    const name = ctName.trim();
    const email = ctEmail.trim();
    if (!name || !email) return;
    const rec: AgentContact = { name, role: ctRole.trim(), email, phone: ctPhone.trim(), primary: ctPrimary };
    if (ctEditIndex !== null) updateContact(ctAgencyName, ctBranchName, ctEditIndex, rec);
    else addContact(ctAgencyName, ctBranchName, rec);
    resetContactForm();
    refresh();
  }
  function startEditContact(index: number) {
    const c = ctContacts[index];
    if (!c) return;
    setCtEditIndex(index);
    setCtName(c.name);
    setCtRole(c.role || '');
    setCtEmail(c.email);
    setCtPhone(c.phone || '');
    setCtPrimary(!!c.primary);
  }
  function deleteContact(index: number) {
    removeContact(ctAgencyName, ctBranchName, index);
    resetContactForm();
    refresh();
  }
  function makePrimary(index: number) {
    setPrimaryContact(ctAgencyName, ctBranchName, index);
    refresh();
  }

  function toggle(id: string) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onHeadClick(e: MouseEvent, id: string) {
    const target = e.target as HTMLElement;
    if (target.closest('.statlink') || target.closest('[data-stop]')) return;
    toggle(id);
  }

  function saveAgency() {
    if (!agencyName.trim()) return;
    addAgency({ name: agencyName.trim(), group: agencyGroup.trim() || undefined }, partnerScope);
    setAgencyOpen(false);
    refresh();
  }
  function openAddBranch(name?: string) {
    setBranchName('');
    setBranchArea('');
    setBranchAgency(name || partnerPoolForBranch[0]?.name || '');
    setBranchOpen(true);
  }
  function saveBranch() {
    if (!branchName.trim() || !branchAgency) return;
    addBranch(branchAgency, { name: branchName.trim(), area: branchArea.trim() || undefined });
    setBranchOpen(false);
    refresh();
  }

  const eyebrow = role === 'superadmin' ? 'opndoor admin' : role === 'management' ? 'Management' : 'Organisation';
  const roleNote: ReactNode =
    role === 'superadmin' ? <>As an <b>opndoor admin</b> you have full control: add, edit and reorganise agencies and branches, and sync the hierarchy with HubSpot.</>
      : role === 'management' ? <>You can view every agency and branch across the estate and add new ones on the fly. Editing existing records and HubSpot sync are handled by <b>opndoor</b>.</>
        : <>You can view every agency and branch and add new ones on the fly. Editing existing records is handled by <b>opndoor</b>.</>;

  // Filtered, with expand-all while searching (mirrors org-management.html).
  const shownAgencies = pool
    .map((a) => {
      const agencyMatch = a.name.toLowerCase().includes(q);
      const branches = a.branches.filter((b) => !q || agencyMatch || b.name.toLowerCase().includes(q));
      return { a, agencyMatch, branches };
    })
    .filter(({ agencyMatch, branches }) => !(q && !agencyMatch && branches.length === 0));

  return (
    <>
      <div className="page-head">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="page-head__title" style={{ marginTop: 10 }}>Agencies &amp; branches</h1>
          <p className="page-head__sub">Manage the partner organisation hierarchy. Search to find an agency or branch, expand to see branches, or click any figure to view the applications behind it.</p>
        </div>
        <div className="page-head__actions">
          {role === 'superadmin' && (
            <PartnerSelect
              ariaLabel="Partner"
              value={selectedPartner}
              onChange={setSelectedPartner}
              options={[{ value: ALL_PARTNERS, label: 'All partners' }, ...getPartners().map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          <Button variant="ghost" size="sm"><Icon name="download" /> Export</Button>
          <Button variant="primary" size="sm" onClick={() => { setAgencyName(''); setAgencyGroup(''); setAgencyOpen(true); }}><Icon name="plus" /> Add agency</Button>
        </div>
      </div>

      <div className="rolenote" style={{ marginBottom: 18 }}>
        <Icon name="shield" />
        <span>{roleNote}</span>
      </div>

      <div className={`org-search${query.trim() ? ' has-q' : ''}`}>
        <Icon name="search" />
        <input type="text" placeholder="Search agencies or branches" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="org-search__clear" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="x" size={16} /></button>
      </div>

      <div className="org">
        {shownAgencies.map(({ a, branches }) => {
          const id = agencyId(a);
          const open = q ? true : openSet.has(id);
          const fees = feesOf(a, true);
          const meta = `${a.group ? `${a.group} · ` : ''}${a.branches.length} ${a.branches.length === 1 ? 'branch' : 'branches'}`;
          return (
            <div className={`agency${open ? ' is-open' : ''}`} key={id}>
              <div className="agency__head" onClick={(e) => onHeadClick(e, id)}>
                <span className="agency__chev"><Icon name="chevronRight" size={18} strokeWidth={2.2} /></span>
                <span className="agency__ic"><Icon name="org" /></span>
                <div className="agency__txt">
                  <div className="agency__name">{highlight(a.name, q)}</div>
                  <div className="agency__meta">{meta}</div>
                  <ContactSummary agency={a} branch={null} canManage={canManageContacts} onManage={() => openContacts(a.name, null)} />
                </div>
                <Link className="statlink statlink--agency" to={`/applications?agency=${encodeURIComponent(a.name)}`} title={`View all applications for ${a.name}`}>
                  <div className="agency__stat"><div className="n">{a.referrals}</div><div className="l">Referrals</div></div>
                  <div className="agency__stat"><div className="n">{fmtK(fees)}</div><div className="l">Fees collected</div></div>
                  {isMgmt && <div className="agency__stat"><div className="n">{fmtK(fees * rates.partner)}</div><div className="l">Your commission</div></div>}
                  {isMgmt && <div className="agency__stat"><div className="n">{fmtK(fees * rates.agent)}</div><div className="l">Agent comm.</div></div>}
                  {goIcon}
                </Link>
                {role === 'superadmin' && (
                  <div className="agency__actions" data-stop>
                    <button className="iconbtn iconbtn--sm" title="Edit"><Icon name="edit" /></button>
                  </div>
                )}
              </div>
              <div className="branches">
                {branches.map((b) => {
                  const bFees = feesOf(b, false);
                  return (
                    <div className="branch" key={b.name}>
                      <span className="branch__line">│</span>
                      <span className="branch__ic"><Icon name="home" /></span>
                      <div className="branch__txt">
                        <div className="branch__name">{highlight(b.name, q)}</div>
                        <div className="branch__meta">{b.area}</div>
                        <ContactSummary agency={a} branch={b} canManage={canManageContacts} onManage={() => openContacts(a.name, b.name)} />
                      </div>
                      <Link className="statlink statlink--branch" to={`/applications?branch=${encodeURIComponent(b.name)}`} title={`View applications for ${b.name}`}>
                        <div className="branch__stat"><b>{b.referrals}</b>referrals</div>
                        <div className="branch__stat"><b>{fmtK(bFees)}</b>fees collected</div>
                        {isMgmt && <div className="branch__stat"><b>{fmtK(bFees * rates.partner)}</b>your comm.</div>}
                        {isMgmt && <div className="branch__stat"><b>{fmtK(bFees * rates.agent)}</b>agent comm.</div>}
                        {goIcon}
                      </Link>
                    </div>
                  );
                })}
                {!q && (
                  <div className="branch__add">
                    <Button variant="ghost" size="sm" onClick={() => openAddBranch(a.name)}><Icon name="plus" /> Add branch</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`org-empty${shownAgencies.length ? '' : ' is-shown'}`}>No agencies or branches match your search.</div>

      {/* ADD AGENCY */}
      <Modal
        open={agencyOpen}
        onClose={() => setAgencyOpen(false)}
        title="Add agency"
        sub="Create a new agency in the hierarchy. Branches can be added to it afterwards."
        footer={<><Button variant="ghost" onClick={() => setAgencyOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveAgency}>Save agency</Button></>}
      >
        <Field label="Agency name" htmlFor="agency-name"><input id="agency-name" type="text" placeholder="e.g. Riverside Lettings" autoComplete="off" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} /></Field>
        <Field label="Group / network" htmlFor="agency-group" hint="Optional"><input id="agency-group" type="text" placeholder="e.g. ABC group" autoComplete="off" value={agencyGroup} onChange={(e) => setAgencyGroup(e.target.value)} /></Field>
      </Modal>

      {/* ADD BRANCH */}
      <Modal
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title="Add branch"
        sub="Add a branch to an agency in the hierarchy."
        footer={<><Button variant="ghost" onClick={() => setBranchOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveBranch}>Save branch</Button></>}
      >
        <Field label="Branch name" htmlFor="branch-name"><input id="branch-name" type="text" placeholder="e.g. Notting Hill" autoComplete="off" value={branchName} onChange={(e) => setBranchName(e.target.value)} /></Field>
        <Field label="Postcode / area" htmlFor="branch-area"><input id="branch-area" type="text" placeholder="e.g. W11" autoComplete="off" value={branchArea} onChange={(e) => setBranchArea(e.target.value)} /></Field>
        <Field label="Parent agency" htmlFor="branch-agency">
          <select id="branch-agency" value={branchAgency} onChange={(e) => setBranchAgency(e.target.value)}>
            {partnerPoolForBranch.map((a) => <option key={agencyId(a)} value={a.name}>{a.name}</option>)}
          </select>
        </Field>
      </Modal>

      {/* MANAGE AGENT CONTACTS */}
      <Modal
        open={ctOpen}
        onClose={() => setCtOpen(false)}
        title={`${ctBranchName || ctAgencyName} contacts`}
        sub={ctBranchName ? 'Agent contacts for this branch. Who the Deed of Guarantee is sent to.' : 'Agency contacts. Used as the default for branches with no contact of their own.'}
        footer={<Button variant="primary" onClick={() => setCtOpen(false)}>Done</Button>}
      >
        {ctBranchName && ctContacts.length === 0 && (
          <div className="ct-inherit-note">
            {effectivePrimary(ctAgency, ctBranch).contact ? (
              <>This branch has no contact of its own, so it uses the <b>{ctAgencyName}</b> agency default (<b>{effectivePrimary(ctAgency, ctBranch).contact!.name}</b>). Add a contact below to override it for this branch.</>
            ) : (
              <>This branch has no contact of its own, and the agency has none either. Add a branch contact below, or add an agency contact to cover all its branches.</>
            )}
          </div>
        )}

        <div>
          {ctContacts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-mute)', padding: '6px 0 14px' }}>No contacts yet.</p>
          ) : (
            ctContacts.map((c, i) => (
              <div className="ct-row" key={i}>
                <span className="ct-av">{ctInitials(c.name)}</span>
                <div className="ct-main">
                  <div className="ct-name">{c.name}{c.primary && <span className="ct-primary">Primary</span>}</div>
                  <div className="ct-sub">{c.role ? `${c.role} · ` : ''}{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                </div>
                <div className="ct-actions">
                  {!c.primary && <button onClick={() => makePrimary(i)}>Set primary</button>}
                  <button onClick={() => startEditContact(i)}>Edit</button>
                  <button onClick={() => deleteContact(i)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 6 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>{ctEditIndex !== null ? 'Edit contact' : 'Add a contact'}</div>
          <div className="form-grid">
            <Field label="Name" htmlFor="ct-name"><input id="ct-name" type="text" autoComplete="off" value={ctName} onChange={(e) => setCtName(e.target.value)} /></Field>
            <Field label="Role" htmlFor="ct-role" hint="Optional"><input id="ct-role" type="text" placeholder="e.g. Branch manager" autoComplete="off" value={ctRole} onChange={(e) => setCtRole(e.target.value)} /></Field>
            <Field label="Email" htmlFor="ct-email"><input id="ct-email" type="email" autoComplete="off" value={ctEmail} onChange={(e) => setCtEmail(e.target.value)} /></Field>
            <Field label="Phone" htmlFor="ct-phone" hint="Optional"><input id="ct-phone" type="text" autoComplete="off" value={ctPhone} onChange={(e) => setCtPhone(e.target.value)} /></Field>
            <label className="field span-2" style={{ flexDirection: 'row', alignItems: 'center', gap: 9, display: 'flex' }}>
              <input type="checkbox" checked={ctPrimary} onChange={(e) => setCtPrimary(e.target.checked)} style={{ width: 'auto' }} />
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>Primary contact (receives the deed by default)</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Button variant="primary" size="sm" onClick={submitContact}>{ctEditIndex !== null ? 'Save contact' : 'Add contact'}</Button>
            {ctEditIndex !== null && <Button variant="ghost" size="sm" onClick={resetContactForm}>Cancel edit</Button>}
          </div>
        </div>
      </Modal>
    </>
  );
}
