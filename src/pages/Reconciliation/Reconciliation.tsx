/* =====================================================================
   Reconciliation (opndoor admin only, enforced by the route guard).
   The real queue of agencies/branches created on the fly by referrers
   (review_state = pending_review), each with its parent, creator, created-at,
   attached referral count, and a same/similar-name hint against confirmed
   records. "Confirm as new" promotes it to a confirmed canonical record
   (audited). The Sync button pushes confirmed records to HubSpot on demand (a
   2-minute cron also runs the sync). Merge is not built yet (disabled).
   ===================================================================== */
import { useCallback, useEffect, useState } from 'react';
import { confirmReconEntity, loadReconciliationQueue, triggerHubspotSync, type ReconRow } from '@/data';
import { useSession } from '@/session/SessionContext';
import { usePageMeta } from '@/components/layout/pageMeta';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import '@/components/ui/opbar.css';
import './Reconciliation.css';

type Filter = 'all' | 'agency' | 'branch' | 'dupes';

export function Reconciliation() {
  usePageMeta('reconcile', 'Reconciliation', ['Home', 'opndoor', 'Reconciliation']);
  const toast = useToast();
  const { refresh: refreshData } = useSession();
  const [queue, setQueue] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setQueue(await loadReconciliationQueue());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load the reconciliation queue.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const dupes = queue.filter((i) => i.match).length;
  const newOnes = queue.length - dupes;
  const agencyCount = queue.filter((i) => i.type === 'agency').length;
  const branchCount = queue.filter((i) => i.type === 'branch').length;

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: queue.length },
    { id: 'agency', label: 'Agencies', count: agencyCount },
    { id: 'branch', label: 'Branches', count: branchCount },
    { id: 'dupes', label: 'Possible duplicates', count: dupes },
  ];

  const passes = (item: ReconRow) => (filter === 'all' ? true : filter === 'dupes' ? !!item.match : item.type === filter);
  const visible = queue.filter(passes);

  async function confirm(item: ReconRow) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await confirmReconEntity(item.type, item.entityId);
      await refreshData(); // re-hydrate so the sidebar pending badge decrements
      toast(`Confirmed "${item.name}" as a new canonical ${item.type}.`);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not confirm the record.');
    } finally {
      setBusyId(null);
    }
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      await triggerHubspotSync();
      toast('HubSpot sync started — confirmed records update within ~2 minutes.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the HubSpot sync.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="rec-eyebrow"><span className="opx">opndoor</span> · internal admin</div>
          <h1 className="page-head__title" style={{ marginTop: 10 }}>Reconciliation</h1>
          <p className="page-head__sub">Agencies and branches created on the fly by referrers, awaiting review. Confirm new canonical records — confirmed agencies and branches sync to HubSpot automatically every couple of minutes (or use Sync HubSpot to run it now). Merging likely duplicates is coming in a later release.</p>
        </div>
        <div className="page-head__actions">
          <Button variant="ghost" size="sm" disabled={syncing} onClick={syncNow} title="Push confirmed records to HubSpot now (also runs automatically every 2 minutes)."><Icon name="refresh" /> {syncing ? 'Syncing…' : 'Sync HubSpot'}</Button>
        </div>
      </div>

      <div className="card opbar">
        <Icon name="shield" />
        <span>Visible to <b>opndoor admins</b> only. Partner super-admins, management and referrers never see this reconciliation view.</span>
      </div>

      <div className="qstat">
        <div className="qstat__card"><div className="qstat__n">{queue.length}</div><div className="qstat__l">Awaiting review</div></div>
        <div className="qstat__card"><div className="qstat__n" style={{ color: 'var(--warn)' }}>{dupes}</div><div className="qstat__l">Possible duplicates</div></div>
        <div className="qstat__card"><div className="qstat__n" style={{ color: 'var(--heliotrope-deep)' }}>{newOnes}</div><div className="qstat__l">New, no match found</div></div>
      </div>

      <div className="rtabs">
        {tabs.map((t) => (
          <button key={t.id} className={`rtab${filter === t.id ? ' is-active' : ''}`} onClick={() => setFilter(t.id)}>
            {t.label} <span className="rtab__c">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="rq">
        {visible.map((item) => {
          const parent = item.type === 'branch' ? <>Under <b>{item.parent}</b> · </> : null;
          return (
            <div className="rqitem" key={item.id} style={busyId === item.id ? { opacity: 0.5 } : undefined}>
              <span className={`rqitem__ic ${item.type === 'agency' ? 'rqitem__ic--agency' : 'rqitem__ic--branch'}`}>
                <Icon name={item.type === 'agency' ? 'building' : 'home'} />
              </span>
              <div className="rqitem__main">
                <div className="rqitem__top">
                  <span className="rqitem__name">{item.name}</span>
                  {item.type === 'agency' ? <span className="tag tag--admin">New agency</span> : <span className="tag">New branch</span>}
                </div>
                <div className="rqitem__meta">{parent}created by <b>{item.by}</b> · {item.when} · {item.refs} referral{item.refs === 1 ? '' : 's'} attached</div>

                {item.match ? (
                  <div className="match">
                    <span className="match__lbl">{item.matchExact ? 'Same name exists' : 'Possible duplicate'}</span>
                    <span className="match__txt">Looks like existing <b>{item.match}</b>{item.matchExact ? ' (exact name match)' : ' (similar name)'}</span>
                  </div>
                ) : (
                  <div className="match match--none">
                    <span className="match__lbl">No match found</span>
                    <span className="match__txt">No similar confirmed record. Likely a genuinely new {item.type}.</span>
                  </div>
                )}
              </div>

              <div className="rqitem__actions">
                <Button variant="ghost" size="sm" disabled title="Merge is coming in a later release."><Icon name="merge" /> Merge into…</Button>
                <Button variant="primary" size="sm" disabled={busyId === item.id} onClick={() => confirm(item)}>
                  <Icon name="check" strokeWidth={2.2} /> Confirm as new
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={`empty${!loading && queue.length === 0 ? ' is-shown' : ''}`}>Nothing left to reconcile. The hierarchy is clean.</div>
    </>
  );
}
