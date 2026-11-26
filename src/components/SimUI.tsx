import { CONFIG } from '../config';
// Éléments d'interface communs au schéma 2D et à la simulation 3D.
import { useState } from 'react';
import type { LedState } from '../db/types';
import type { Geometry } from '../lib/geometry';
import { LED_LABEL, SCENARIOS, SCENARIO_ORDER, type Scenario } from '../lib/parkingSim';
import type { ParkingSim } from '../lib/useParkingSim';
import { pcbLabel } from '../lib/utils';
import { LED } from '../styles/brand';
import { Card } from './PageShell';
import { ActionMenu, Badge, Btn, useUI, Tabs } from './ui';
import { Icon, type IconName } from './Icons';

export const LED_COLOR: Record<LedState, string> = { ...LED };

export function SimToolbar({ sim }: { sim: ParkingSim }) {
  const { toast } = useUI();
  const [choice, setChoice] = useState<Scenario>('aleatoire');
  return (
    <>
      <select className="select-sm" value={sim.scenario || choice} disabled={sim.running} onChange={(e) => setChoice(e.target.value as Scenario)} aria-label="Scénario de simulation">
        {SCENARIO_ORDER.map((s) => (
          <option key={s} value={s}>{SCENARIOS[s].label}</option>
        ))}
      </select>
      <Btn
        kind={sim.running ? 'danger' : 'primary'}
        icon={sim.running ? 'pause' : 'play'}
        onClick={() => {
          if (sim.running) {
            sim.stop();
            toast('Simulation arrêtée : retour aux états enregistrés.', 'info');
          } else {
            sim.start(choice);
            toast(`Simulation « ${SCENARIOS[choice].label} » démarrée (non enregistrée).`, 'info');
          }
        }}
      >
        {sim.running ? 'Arrêter' : 'Lancer la simulation'}
      </Btn>
      <select className="select-sm" value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))} aria-label="Vitesse">
        <option value={0.5}>Vitesse × 0,5</option>
        <option value={1}>Vitesse × 1</option>
        <option value={2}>Vitesse × 2</option>
      </select>
    </>
  );
}

export function LedKpis({ sim }: { sim: ParkingSim }) {
  return (
    <div className="led-kpis">
      {(['libre', 'occupe', 'maintenance'] as LedState[]).map((k) => (
        <div key={k} className="led-kpi">
          <i style={{ background: LED_COLOR[k], boxShadow: `0 0 10px ${LED_COLOR[k]}` }} />
          <span>{LED_LABEL[k]}</span>
          <b>{sim.counts[k]}</b>
        </div>
      ))}
      <div className="led-kpi">
        <Icon name="car" size={16} />
        <span>Taux d'occupation</span>
        <b>{Math.round((sim.counts.occupe / 24) * 100)} %</b>
      </div>
      {sim.running && <Badge tone="orange">Simulation « {sim.scenarioLabel} » — non enregistrée</Badge>}
    </div>
  );
}

export function ScenarioCard({ sim }: { sim: ParkingSim }) {
  return (
    <Card title="Scénarios de simulation" icon="play">
      <ul className="scen-list">
        {SCENARIO_ORDER.map((s) => (
          <li key={s} className={sim.scenario === s ? 'on' : ''}>
            <b>{SCENARIOS[s].label}</b>
            <span>{SCENARIOS[s].desc}</span>
          </li>
        ))}
      </ul>
      {sim.running && (
        <div className="scen-status">
          <i className="pulse" /> {sim.status || 'Simulation en cours…'}
        </div>
      )}
      <p className="muted small">Les scénarios ne modifient pas les états enregistrés : à l'arrêt, chaque place reprend son état réel.</p>
    </Card>
  );
}

export function PlaceCommand({ sim, geo, selected }: { sim: ParkingSim; geo: Geometry; selected: number | null }) {
  const p = selected ? geo.places.find((x) => x.number === selected) : undefined;
  return (
    <Card title="Commande des places" icon="live">
      <p className="muted small">Sélectionnez une place (double-clic : bascule libre ↔ occupé).</p>
      {p ? (
        <div className="led-ctrl">
          <div className="ps-head">
            <h3>Place n°{p.number} {p.pmr && <Badge tone="blue">PMR</Badge>}</h3>
            <Badge tone="navy" dot={false}>{pcbLabel(p.pcb)}</Badge>
          </div>
          <div className="led-btns">
            {(['libre', 'occupe', 'maintenance'] as LedState[]).map((k) => (
              <button key={k} className={'led-btn ' + (sim.st(p.number) === k ? 'on' : '')} style={{ ['--c' as any]: LED_COLOR[k] }} onClick={() => sim.apply(p.number, k, !sim.running)}>
                <i /> {LED_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">Aucune place sélectionnée.</p>
      )}
      <div className="row-actions">
        <Btn small icon="check" disabled={sim.running} onClick={() => sim.bulk('libre')}>Tout libérer</Btn>
        <Btn small icon="car" disabled={sim.running} onClick={() => sim.bulk('occupe')}>Tout occuper</Btn>
        <Btn small kind="ghost" icon="restore" disabled={sim.running} onClick={sim.reset}>Réinitialiser</Btn>
      </div>
    </Card>
  );
}

export function LedStateTable({ sim }: { sim: ParkingSim }) {
  return (
    <div className="print-only avoid-break print-break-before">
      <h3 className="print-h">État des 24 places</h3>
      <table className="table print-table">
        <thead>
          <tr>
            <th>Place</th><th>PCB</th><th>État LED</th><th>Place</th><th>PCB</th><th>État LED</th><th>Place</th><th>PCB</th><th>État LED</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
            <tr key={r}>
              {[1, 9, 17].map((base) => {
                const n = base + r;
                return [
                  <td key={'a' + n}><b>{n}</b>{n === 1 ? ' (PMR)' : ''}</td>,
                  <td key={'b' + n}>{pcbLabel(Math.ceil(n / 2))}</td>,
                  <td key={'c' + n}>{LED_LABEL[sim.ledOf(n)]}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Variante compacte (Simulation 3D) ----------

/** Scénario + lancement, et options regroupées dans un menu. */
export function SimControlsCompact({ sim }: { sim: ParkingSim }) {
  const { toast } = useUI();
  const [choice, setChoice] = useState<Scenario>('aleatoire');
  const speeds: [number, string][] = [[0.5, 'Vitesse × 0,5'], [1, 'Vitesse × 1'], [2, 'Vitesse × 2']];
  return (
    <>
      <select className="select-sm" value={sim.scenario || choice} disabled={sim.running} onChange={(e) => setChoice(e.target.value as Scenario)} aria-label="Scénario de simulation">
        {SCENARIO_ORDER.map((s) => (
          <option key={s} value={s}>{SCENARIOS[s].label}</option>
        ))}
      </select>
      <Btn
        kind={sim.running ? 'danger' : 'primary'}
        icon={sim.running ? 'pause' : 'play'}
        title={sim.running ? 'Arrêter la simulation' : SCENARIOS[choice].desc}
        onClick={() => {
          if (sim.running) {
            sim.stop();
            toast('Simulation arrêtée : retour aux états enregistrés.', 'info');
          } else sim.start(choice);
        }}
      >
        {sim.running ? 'Arrêter' : 'Lancer'}
      </Btn>
      <ActionMenu
        items={[
          ...speeds.map(([v, l]) => ({ label: l, icon: (sim.speed === v ? 'check' : 'clock') as IconName, onClick: () => sim.setSpeed(v) })),
          ...(sim.running
            ? []
            : [
                { label: 'Tout libérer', icon: 'check' as const, onClick: () => sim.bulk('libre') },
                { label: 'Tout occuper', icon: 'car' as const, onClick: () => sim.bulk('occupe') },
                { label: 'Réinitialiser', icon: 'restore' as const, onClick: sim.reset },
              ]),
        ]}
      />
    </>
  );
}

/** Compteurs discrets affichés sur la vue. */
export function LedSummary({ sim }: { sim: ParkingSim }) {
  const c = sim.counts;
  return (
    <div className="led-sum no-print">
      <span><i style={{ background: LED_COLOR.libre }} />{c.libre} libre{c.libre > 1 ? 's' : ''}</span>
      <span><i style={{ background: LED_COLOR.occupe }} />{c.occupe} occupée{c.occupe > 1 ? 's' : ''}</span>
      {c.maintenance > 0 && <span><i style={{ background: LED_COLOR.maintenance }} />{c.maintenance} en maintenance</span>}
    </div>
  );
}

/** Petit panneau qui apparaît quand on choisit une place. */
export function PlacePopover({ sim, geo, selected, onClose }: { sim: ParkingSim; geo: Geometry; selected: number | null; onClose: () => void }) {
  const p = selected ? geo.places.find((x) => x.number === selected) : undefined;
  if (!p) return null;
  return (
    <div className="place-pop no-print" role="dialog" aria-label={`Place n°${p.number}`}>
      <div className="pp-head">
        <b>Place n°{p.number}{p.pmr ? ' · PMR' : ''}</b>
        <span>{pcbLabel(p.pcb)}</span>
        <button onClick={onClose} aria-label="Fermer"><Icon name="x" size={14} /></button>
      </div>
      <div className="pp-btns">
        {(['libre', 'occupe', 'maintenance'] as LedState[]).map((k) => (
          <button key={k} className={'led-btn ' + (sim.st(p.number) === k ? 'on' : '')} style={{ ['--c' as any]: LED_COLOR[k] }} onClick={() => sim.apply(p.number, k, !sim.running)}>
            <i /> {LED_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ligne de synthèse imprimée en tête des documents de simulation. */
export function PrintSummary({ sim }: { sim: ParkingSim }) {
  return (
    <p className="print-only print-summary">
      Libre : <b>{sim.counts.libre}</b> · Occupé : <b>{sim.counts.occupe}</b> · Maintenance : <b>{sim.counts.maintenance}</b> · Taux d'occupation : <b>{Math.round((sim.counts.occupe / 24) * 100)} %</b>
      {sim.running ? ` — simulation « ${sim.scenarioLabel} » en cours (états non enregistrés)` : ''}
    </p>
  );
}

/** Onglets pour passer du schéma 2D à la vue 3D (mêmes états de LED). */
export function SimTabs({ current, go }: { current: 'schema' | 'simulation'; go?: (r: any) => void }) {
  if (!go) return null;
  return (
    <Tabs
      className="inline list-tabs"
      value={current}
      onChange={(id) => id !== current && go(id)}
      items={[
        { id: 'schema', label: CONFIG.menu.schema || 'Schéma 2D', icon: 'live' },
        { id: 'simulation', label: CONFIG.menu.simulation || 'Vue 3D', icon: 'cube' },
      ]}
    />
  );
}
