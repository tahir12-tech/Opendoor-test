/* =====================================================================
   Topbar — breadcrumbs, page title, a (decorative) global search, the demo
   role switcher and the help + notifications popovers. Ported from
   portal.js buildTopbar. The hamburger toggles the mobile nav drawer.
   ===================================================================== */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMetaValue } from './pageMeta';
import { RoleSwitch } from './RoleSwitch';
import { GlobalSearch } from './GlobalSearch';
import { HelpMenu, NotificationsMenu, type Pop } from './TopbarMenus';
import { Icon } from '@/components/ui/Icon';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { getNotifications, markNotificationsRead, notificationsUnread, type NotificationItem } from '@/data';
import { useSession } from '@/session/SessionContext';

// Breadcrumb segments that map to a real landing route become links (#63).
// Group headers ('Home' aside) like 'Administration'/'opndoor' have no page and
// stay plain text, as does the last (current-page) segment.
const CRUMB_ROUTES: Record<string, string> = {
  Home: '/dashboard',
  Dashboard: '/dashboard',
  Applications: '/applications',
  'League tables': '/league',
  Activity: '/activity',
  'Agencies & branches': '/agencies',
  Partners: '/partners',
  Users: '/users',
  Reconciliation: '/reconciliation',
  'Help & resources': '/help',
  New: '/new-application',
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { title, crumbs } = usePageMetaValue();
  const { currentUserId } = useSession();
  const [pop, setPop] = useState<Pop>(null);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  // Read state persists per user (item #64), so reopening the panel does not
  // re-light everything. In mock mode there is no user, so we key on 'demo'.
  const userKey = currentUserId ?? 'demo';
  const [readTick, setReadTick] = useState(0);
  const actionsRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(actionsRef, () => setPop(null), pop !== null);

  // Real, RLS-scoped notifications for the signed-in viewer (demo entries in mock
  // mode). Refetched when the panel is opened so relative times stay honest.
  useEffect(() => {
    let cancelled = false;
    getNotifications().then((n) => { if (!cancelled) setNotifs(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pop === 'notif']);

  // readTick forces a recompute after "Mark all read" persists.
  void readTick;
  const notifRead = !notificationsUnread(userKey, notifs);
  const clearNotifs = () => { markNotificationsRead(userKey, notifs); setReadTick((t) => t + 1); };

  const toggle = (which: Exclude<Pop, null>) => setPop((cur) => (cur === which ? null : which));

  return (
    <>
      <button className="topbar__menu" aria-label="Open menu" onClick={onMenu}>
        <Icon name="menu" strokeWidth={2.2} />
      </button>

      <div className="stack">
        {crumbs.length > 0 && (
          <div className="topbar__crumbs">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              const to = CRUMB_ROUTES[c];
              return (
                <span key={i} style={{ display: 'contents' }}>
                  {i > 0 && <span className="sep">/</span>}
                  {isLast ? <b>{c}</b> : to ? <Link to={to}>{c}</Link> : <span>{c}</span>}
                </span>
              );
            })}
          </div>
        )}
        <div className="topbar__title">{title}</div>
      </div>

      <GlobalSearch />

      <div className="topbar__actions" ref={actionsRef}>
        <RoleSwitch />
        <HelpMenu open={pop === 'help'} onToggle={() => toggle('help')} />
        <NotificationsMenu open={pop === 'notif'} onToggle={() => toggle('notif')} read={notifRead} onClear={clearNotifs} items={notifs} />
      </div>
    </>
  );
}
