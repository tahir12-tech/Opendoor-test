/* =====================================================================
   Topbar popovers — Help & support and Notifications.
   The parent Topbar coordinates which one is open (only one at a time).
   Notification rows deep-link to application detail routes.

   Notifications are driven by real events: in live mode getNotifications reads
   the RLS-scoped activity_log (the viewer's own referrals / partner / all), so
   no cross-partner data ever appears. Mock mode keeps the demo entries.
   ===================================================================== */
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import type { NotificationItem } from '@/data';

type Pop = 'help' | 'notif' | null;

const DOT: Record<NotificationItem['dot'], string> = {
  sent: 'var(--sent)', paid: 'var(--paid)', deed: 'var(--deed)', other: 'var(--heliotrope)',
};

export function HelpMenu({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className={`tb-pop${open ? ' is-open' : ''}`}>
      <button className="iconbtn" aria-label="Help" onClick={onToggle}>
        <Icon name="help" />
      </button>
      <div className="tb-pop__menu tb-pop__menu--sm">
        <div className="tb-pop__head">
          <span className="tb-pop__title">Help &amp; support</span>
        </div>
        <Link className="tb-pop__row" to="/help#getting-started">
          <span className="tb-pop__ic"><Icon name="book" /></span>
          <div>
            <div className="tb-pop__row-t">Getting started guide</div>
            <div className="tb-pop__row-s">How to refer and track applications</div>
          </div>
        </Link>
        <Link className="tb-pop__row" to="/help#faqs">
          <span className="tb-pop__ic"><Icon name="help" /></span>
          <div>
            <div className="tb-pop__row-t">FAQs</div>
            <div className="tb-pop__row-s">Common questions about the portal</div>
          </div>
        </Link>
        <a className="tb-pop__row" href="mailto:partners@opndoor.co">
          <span className="tb-pop__ic"><Icon name="mail" /></span>
          <div>
            <div className="tb-pop__row-t">Contact your account manager</div>
            <div className="tb-pop__row-s">partners@opndoor.co</div>
          </div>
        </a>
        <div className="tb-pop__foot">
          <Link to="/help">Open help &amp; resources</Link>
        </div>
      </div>
    </div>
  );
}

export function NotificationsMenu({ open, onToggle, read, onClear, items }: { open: boolean; onToggle: () => void; read: boolean; onClear: () => void; items: NotificationItem[] }) {
  const dim = { opacity: read ? 0.25 : 1 };
  const hasItems = items.length > 0;
  return (
    <div className={`tb-pop${open ? ' is-open' : ''}`}>
      <button className="iconbtn" aria-label="Notifications" onClick={onToggle}>
        <Icon name="bell" />
        {!read && hasItems && <span className="iconbtn__dot" />}
      </button>
      <div className="tb-pop__menu">
        <div className="tb-pop__head">
          <span className="tb-pop__title">Notifications</span>
          {hasItems && (
            <button
              className="tb-pop__clear"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        {hasItems ? (
          items.map((n, i) => (
            <Link className="tb-pop__row" to={`/applications/${n.ref}`} key={`${n.ref}-${i}`}>
              <span className="tb-pop__dot" style={{ background: DOT[n.dot], ...dim }} />
              <div>
                <div className="tb-pop__row-t">{n.text}</div>
                <div className="tb-pop__row-s">{n.ref} · {n.time}</div>
              </div>
            </Link>
          ))
        ) : (
          <div className="tb-pop__empty">No new notifications.</div>
        )}
        <div className="tb-pop__foot">
          <Link to="/activity">View all activity</Link>
        </div>
      </div>
    </div>
  );
}

export type { Pop };
