/* =====================================================================
   Topbar popovers — Help & support and Notifications (from portal.js).
   The parent Topbar coordinates which one is open (only one at a time).
   Notification rows deep-link to application detail routes.

   INTEGRATION: notifications would be driven by real events (payment
   received, deed issued, referral sent).
   ===================================================================== */
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';

type Pop = 'help' | 'notif' | null;

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

export function NotificationsMenu({ open, onToggle, read, onClear }: { open: boolean; onToggle: () => void; read: boolean; onClear: () => void }) {
  const dim = { opacity: read ? 0.25 : 1 };
  return (
    <div className={`tb-pop${open ? ' is-open' : ''}`}>
      <button className="iconbtn" aria-label="Notifications" onClick={onToggle}>
        <Icon name="bell" />
        {!read && <span className="iconbtn__dot" />}
      </button>
      <div className="tb-pop__menu">
        <div className="tb-pop__head">
          <span className="tb-pop__title">Notifications</span>
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
        </div>
        <Link className="tb-pop__row" to="/applications/GR-20455">
          <span className="tb-pop__dot" style={{ background: 'var(--paid)', ...dim }} />
          <div>
            <div className="tb-pop__row-t">Chen Wei reached <b>Paid</b></div>
            <div className="tb-pop__row-s">GR-20455 · 14 minutes ago</div>
          </div>
        </Link>
        <Link className="tb-pop__row" to="/applications/GR-20418">
          <span className="tb-pop__dot" style={{ background: 'var(--deed)', ...dim }} />
          <div>
            <div className="tb-pop__row-t">Deed issued for <b>Amelia Hartley</b></div>
            <div className="tb-pop__row-s">GR-20418 · 1 hour ago</div>
          </div>
        </Link>
        <Link className="tb-pop__row" to="/applications/GR-20518">
          <span className="tb-pop__dot" style={{ background: 'var(--sent)', ...dim }} />
          <div>
            <div className="tb-pop__row-t">New referral sent to <b>Omar Farouk</b></div>
            <div className="tb-pop__row-s">GR-20518 · 3 hours ago</div>
          </div>
        </Link>
        <div className="tb-pop__foot">
          <Link to="/activity">View all activity</Link>
        </div>
      </div>
    </div>
  );
}

export type { Pop };
