// Schéma dynamique 2D : signalisation LED de la maquette (vert libre, rouge occupé, bleu maintenance)
// et voitures qui se garent. Simulation de la maquette — ce n'est pas un système de gestion de parking réel.
import { useMemo, useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import { carLength, computeGeometry } from '../lib/geometry';
import { ParkingPlan } from '../components/ParkingPlan';
import { useParkingSim } from '../lib/useParkingSim';
import { animAt, CAR_COLORS, isReversing, type KF } from '../lib/parkingSim';
import { SimTabs, LED_COLOR, LedStateTable, LedSummary, PlacePopover, PrintSummary, SimControlsCompact } from '../components/SimUI';
import { BRAND } from '../styles/brand';
import type { Route } from '../components/Layout';

function Car({ x, y, a, color, L, W, moving, reverse }: KF & { color: string; L: number; W: number; moving?: boolean; reverse?: boolean }) {
  const light = color === '#F8FAFC' || color === '#CBD5E1';
  return (
    <g transform={`translate(${x} ${y}) rotate(${a})`} className="car">
      <rect x={-L / 2 + 0.3} y={-W / 2 + 0.4} width={L} height={W} rx={1.3} fill="#0F172A" opacity=".18" />
      {[-1, 1].map((sx) => [-1, 1].map((sy) => <rect key={sx + '' + sy} x={sx * L * 0.3 - 0.9} y={sy * (W / 2) - 0.45} width={1.8} height={0.9} rx={0.3} fill="#0F172A" />))}
      <rect x={-L / 2} y={-W / 2} width={L} height={W} rx={1.3} fill={color} stroke={light ? '#94A3B8' : 'none'} strokeWidth={0.12} />
      <rect x={L * 0.12} y={-W / 2 + 0.55} width={L * 0.2} height={W - 1.1} rx={0.4} fill={light ? '#64748B' : '#BFD3F2'} opacity=".9" />
      <rect x={-L * 0.38} y={-W / 2 + 0.7} width={L * 0.13} height={W - 1.4} rx={0.35} fill={light ? '#64748B' : '#BFD3F2'} opacity=".8" />
      <rect x={-L * 0.2} y={-W / 2 + 0.5} width={L * 0.3} height={W - 1} rx={0.5} fill="#000" opacity=".08" />
      {moving && (
        <>
          <circle cx={L / 2 - 0.35} cy={-W / 2 + 0.7} r={0.38} fill="#FDE68A" />
          <circle cx={L / 2 - 0.35} cy={W / 2 - 0.7} r={0.38} fill="#FDE68A" />
          {reverse && (
            <>
              <circle cx={-L / 2 + 0.3} cy={-W / 2 + 0.7} r={0.34} fill="#FFFFFF" />
              <circle cx={-L / 2 + 0.3} cy={W / 2 - 0.7} r={0.34} fill="#FFFFFF" />
            </>
          )}
        </>
      )}
      {!moving && (
        <>
          <rect x={-L / 2} y={-W / 2 + 0.45} width={0.35} height={0.9} fill="#DC2626" opacity=".7" />
          <rect x={-L / 2} y={W / 2 - 1.35} width={0.35} height={0.9} fill="#DC2626" opacity=".7" />
        </>
      )}
    </g>
  );
}

export default function Schema({ go }: { go?: (r: Route) => void }) {
  const { data } = useStore();
  const geo = useMemo(() => computeGeometry(data.kv.planConfig), [data.kv.planConfig]);
  const sim = useParkingSim(geo);
  const [sel, setSel] = useState<number | null>(null);
  const L = carLength(geo.cfg);
  const Wc = Math.min(geo.cfg.placeWidth * 0.72, 5.2);
  const now = sim.now;

  return (
    <PageShell title="Schéma dynamique" icon="live" orientation="landscape" actions={<SimControlsCompact sim={sim} />}>
      <SimTabs current="schema" go={go} />
      <PrintSummary sim={sim} />
      <Card className="schema-card schema-solo" pad={false}>
        <div className="p3d-wrap">
          <div className="schema-canvas">
            <ParkingPlan
              geo={geo}
              className="dark-plan"
              viewBox={`-13 -3 ${geo.cfg.plateW + 26} ${geo.cfg.plateH + 6}`}
              options={{ dims: false, pcbs: false, margins: false, numbers: true, marks: false }}
              selected={sel}
              highlightPcb={sim.testPcb}
              onSelect={(n) => setSel(n)}
              placeLayer={(p) => {
                const s = sim.ledOf(p.number);
                const ly = p.ledY; // LED à l'entrée de la place
                const blink = sim.animPlaces.has(p.number) ? 'blink' : '';
                return (
                  <g onDoubleClick={() => !sim.running && sim.st(p.number) !== 'maintenance' && sim.apply(p.number, sim.st(p.number) === 'occupe' ? 'libre' : 'occupe', true)}>
                    {sim.st(p.number) === 'maintenance' && (
                      <g>
                        <rect x={p.x + 0.4} y={p.y + 0.4} width={p.w - 0.8} height={p.h - 0.8} fill={BRAND.sky} opacity=".14" />
                        <path d={`M${p.cx} ${p.cy - 1.6} l1.3 3.2 h-2.6z`} fill={BRAND.orange} stroke="#A85400" strokeWidth={0.12} transform={`translate(0 ${p.row === 'top' ? 1.2 : -1.2})`} />
                      </g>
                    )}
                    <circle cx={p.cx} cy={ly} r={1.6} fill={LED_COLOR[s]} opacity=".25" className={blink} />
                    <circle cx={p.cx} cy={ly} r={0.85} fill={LED_COLOR[s]} filter="url(#glow)" className={blink} />
                  </g>
                );
              }}
            >
              <g className="no-pointer">
                <text x={geo.cfg.plateW + 6.5} y={geo.aisleY - 1.2} fontSize={1.9} fill={BRAND.lime} fontWeight={700} textAnchor="middle">ENTRÉE</text>
                <text x={-6.5} y={geo.aisleY - 1.2} fontSize={1.9} fill="#F87171" fontWeight={700} textAnchor="middle">SORTIE</text>
                <path d={`M${geo.cfg.plateW + 11} ${geo.aisleMid} h-9 m2.2 -1.6 l-2.2 1.6 l2.2 1.6`} stroke={BRAND.lime} strokeWidth={0.35} fill="none" opacity=".55" />
                <path d={`M-2 ${geo.aisleMid} h-9 m2.2 -1.6 l-2.2 1.6 l2.2 1.6`} stroke="#F87171" strokeWidth={0.35} fill="none" opacity=".55" />
                {geo.errors.length === 0 &&
                  geo.places.map((p) => {
                    if (sim.animPlaces.has(p.number) || sim.st(p.number) !== 'occupe') return null;
                    return <Car key={p.number} x={p.cx} y={p.parkY} a={p.row === 'top' ? 270 : 90} color={CAR_COLORS[p.number % CAR_COLORS.length]} L={L} W={Wc} />;
                  })}
                {sim.anims.map((a) => (
                  <Car key={'a' + a.place + a.start} {...animAt(a, now)} color={CAR_COLORS[a.place % CAR_COLORS.length]} L={L} W={Wc} moving reverse={isReversing(a, now)} />
                ))}
              </g>
            </ParkingPlan>
          </div>
          {sim.running && (
            <div className="p3d-status no-print">
              <i className="pulse" />
              <b>{sim.scenarioLabel}</b>
              {sim.status && <span>{sim.status}</span>}
            </div>
          )}
          <LedSummary sim={sim} />
          <PlacePopover sim={sim} geo={geo} selected={sel} onClose={() => setSel(null)} />
        </div>
      </Card>

      <LedStateTable sim={sim} />
    </PageShell>
  );
}
