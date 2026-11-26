// Graphiques SVG légers, couleurs issues du logo ParkX (voir styles/brand.ts).
import { fmtDate } from '../lib/utils';
import { BRAND } from '../styles/brand';

export const C = { navy: BRAND.navy, blue: BRAND.blue, sky: BRAND.sky, green: BRAND.green, forest: BRAND.forest, orange: BRAND.orange, red: BRAND.red, gray: BRAND.gray, grid: BRAND.line, text: BRAND.muted };
export const TONE_COLOR: Record<string, string> = { green: C.green, blue: C.blue, orange: C.orange, red: C.red, gray: C.gray, navy: C.navy };

export function Donut({ parts, size = 150, center, sub }: { parts: { label: string; value: number; color: string }[]; size?: number; center: string; sub?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={center}>
        <circle cx="70" cy="70" r={r} fill="none" stroke={C.grid} strokeWidth="14" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * circ;
            const el = (
              <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
            );
            acc += len;
            return el;
          })}
        <text x="70" y="70" textAnchor="middle" fontSize="22" fontWeight="700" fill={C.navy}>{center}</text>
        {sub && <text x="70" y="88" textAnchor="middle" fontSize="9.5" fill={C.text}>{sub}</text>}
      </svg>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ rows, max }: { rows: { label: string; value: number; color: string; hint?: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <span className="hbar-l">{r.label}</span>
          <div className="hbar-track">
            <div style={{ width: (r.value / m) * 100 + '%', background: r.color }} />
          </div>
          <b>{r.hint ?? r.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Frise chronologique (diagramme de Gantt simplifié). */
export function Timeline({ items, start, end }: { items: { id: string; label: string; start: string; end: string; color: string }[]; start?: string; end?: string }) {
  const valid = items.filter((i) => i.start && i.end);
  if (!valid.length) return <div className="chart-empty">Aucune tâche datée.</div>;
  const ts = valid.flatMap((i) => [new Date(i.start).getTime(), new Date(i.end).getTime()]);
  if (start) ts.push(new Date(start).getTime());
  if (end) ts.push(new Date(end).getTime());
  const t0 = Math.min(...ts),
    t1 = Math.max(...ts) + 86400000;
  const pct = (d: string) => ((new Date(d).getTime() - t0) / (t1 - t0)) * 100;
  const today = pct(new Date().toISOString().slice(0, 10));
  const months: { label: string; left: number }[] = [];
  const m = new Date(t0);
  m.setDate(1);
  while (m.getTime() < t1) {
    const l = ((m.getTime() - t0) / (t1 - t0)) * 100;
    if (l >= 0) months.push({ label: m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), left: l });
    m.setMonth(m.getMonth() + 1);
  }
  return (
    <div className="timeline">
      <div className="tl-scale">
        {months.map((mo) => (
          <span key={mo.label} style={{ left: mo.left + '%' }}>{mo.label}</span>
        ))}
      </div>
      {valid.map((i) => {
        const a = pct(i.start),
          b = Math.max(pct(i.end), a + 1);
        return (
          <div className="tl-row" key={i.id}>
            <span className="tl-label" title={i.label}>{i.label}</span>
            <div className="tl-track">
              {today >= 0 && today <= 100 && <span className="tl-today" style={{ left: today + '%' }} />}
              <div className="tl-bar" style={{ left: a + '%', width: b - a + '%', background: i.color }} title={`${fmtDate(i.start)} → ${fmtDate(i.end)}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
