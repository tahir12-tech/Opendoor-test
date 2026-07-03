/* =====================================================================
   Topbar — breadcrumbs, page title, a (decorative) global search, the demo
   role switcher and the help + notifications popovers. Ported from
   portal.js buildTopbar. The hamburger toggles the mobile nav drawer.
   ===================================================================== */
import { useEffect, useRef, useState } from 'react';
import { usePageMetaValue } from './pageMeta';
import { RoleSwitch } from './RoleSwitch';
import { HelpMenu, NotificationsMenu, type Pop } from './TopbarMenus';
import { Icon } from '@/components/ui/Icon';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { getNotifications, type NotificationItem } from '@/data';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { title, crumbs } = usePageMetaValue();
  const [pop, setPop] = useState<Pop>(null);
  const [notifRead, setNotifRead] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const actionsRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(actionsRef, () => setPop(null), pop !== null);

  // Real, RLS-scoped notifications for the signed-in viewer (demo entries in mock
  // mode). Refetched when the panel is opened so relative times stay honest.
  useEffect(() => {
    let cancelled = false;
    getNotifications().then((n) => { if (!cancelled) setNotifs(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pop === 'notif']);

  const toggle = (which: Exclude<Pop, null>) => setPop((cur) => (cur === which ? null : which));

  return (
    <>
      <button className="topbar__menu" aria-label="Open menu" onClick={onMenu}>
        <Icon name="menu" strokeWidth={2.2} />
      </button>

      <div className="stack">
        {crumbs.length > 0 && (
          <div className="topbar__crumbs">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="sep">/</span>}
                {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
              </span>
            ))}
          </div>
        )}
        <div className="topbar__title">{title}</div>
      </div>

      <div className="topbar__search">
        <Icon name="search" />
        <input type="text" placeholder="Search tenants, references, branches" />
      </div>

      <div className="topbar__actions" ref={actionsRef}>
        <RoleSwitch />
        <HelpMenu open={pop === 'help'} onToggle={() => toggle('help')} />
        <NotificationsMenu open={pop === 'notif'} onToggle={() => toggle('notif')} read={notifRead} onClear={() => setNotifRead(true)} items={notifs} />
      </div>
    </>
  );
}
