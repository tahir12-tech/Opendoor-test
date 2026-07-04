/* =====================================================================
   Global search — the top-bar search, now functional. Matches the signed-in,
   RLS-scoped data the placeholder claims: applications (by tenant, guarantee
   reference or property) and branches. Selecting a result navigates to it.
   ===================================================================== */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { allSummaries, getAgencies } from '@/data';
import { useSession } from '@/session/SessionContext';
import { Icon } from '@/components/ui/Icon';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import './GlobalSearch.css';

interface Result { kind: 'app' | 'branch'; label: string; sub: string; to: string; }

export function GlobalSearch() {
  const navigate = useNavigate();
  const { partnerScope } = useSession();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOnClickOutside(box, () => setOpen(false), open);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const apps: Result[] = allSummaries()
      .filter((a) =>
        a.tenant.toLowerCase().includes(term) ||
        a.ref.toLowerCase().includes(term) ||
        a.prop.toLowerCase().includes(term))
      .slice(0, 6)
      .map((a) => ({ kind: 'app', label: a.tenant, sub: `${a.ref} · ${a.prop}`, to: `/applications/${encodeURIComponent(a.ref)}` }));
    const branches: Result[] = [];
    for (const ag of getAgencies(partnerScope)) {
      for (const b of ag.branches) {
        if (b.name.toLowerCase().includes(term) || ag.name.toLowerCase().includes(term)) {
          branches.push({ kind: 'branch', label: b.name, sub: ag.name, to: '/agencies' });
        }
        if (branches.length >= 4) break;
      }
      if (branches.length >= 4) break;
    }
    return [...apps, ...branches];
  }, [q, partnerScope]);

  const go = (to: string) => { setOpen(false); setQ(''); navigate(to); };
  const term = q.trim();

  return (
    <div className="topbar__search gsearch" ref={box}>
      <Icon name="search" />
      <input
        type="text"
        placeholder="Search tenants, references, branches"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && results[0]) go(results[0].to);
        }}
      />
      {open && term.length >= 2 && (
        <div className="gsearch__pop">
          {results.length === 0 ? (
            <div className="gsearch__empty">No matches for “{term}”.</div>
          ) : (
            results.map((r, i) => (
              <button key={i} className="gsearch__item" onMouseDown={(e) => { e.preventDefault(); go(r.to); }}>
                <Icon name={r.kind === 'app' ? 'file' : 'building'} />
                <span className="gsearch__label">{r.label}</span>
                <span className="gsearch__sub">{r.sub}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
