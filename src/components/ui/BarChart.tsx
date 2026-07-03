/* =====================================================================
   BarChart — the horizontal .bars/.bar volume charts used on the dashboard
   (by branch / agency / referrer and the monthly trend). The caller passes
   pre-sorted rows and which index is the top performer.
   ===================================================================== */
import './BarChart.css';

export interface BarRow {
  label: string;
  sub?: string;
  value: number;
  display: string;
}

export function BarChart({ rows, topIndex, max: fixedMax }: { rows: BarRow[]; topIndex: number; max?: number }) {
  const max = fixedMax ?? (rows.length ? Math.max(...rows.map((r) => r.value), 1) : 1);
  return (
    <div className="bars">
      {rows.map((r, i) => {
        const pct = max ? Math.round((r.value / max) * 100) : 0;
        return (
          <div className={`bar${i === topIndex ? ' is-top' : ''}`} key={`${r.label}-${i}`}>
            <span className="bar__label">
              <span className="bar__main">{r.label}</span>
              {r.sub && <span className="bar__sub">{r.sub}</span>}
            </span>
            <span className="bar__track">
              <span className="bar__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="bar__val">{r.display}</span>
          </div>
        );
      })}
    </div>
  );
}
