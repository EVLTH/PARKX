// Simulation 3D de la maquette — page épurée : la vue 3D occupe l'écran, les commandes sont regroupées dessus.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import { computeGeometry } from '../lib/geometry';
import { useParkingSim } from '../lib/useParkingSim';
import { LedStateTable, LedSummary, PlacePopover, PrintSummary, SimControlsCompact, SimTabs } from '../components/SimUI';
import { Parking3D, type CamView, type Parking3DHandle } from '../components/Parking3D';
import { useUI } from '../components/ui';
import { Icon, type IconName } from '../components/Icons';
import { dataURLToBlob, downloadBlob, stamp } from '../lib/utils';
import type { Route } from '../components/Layout';
import { CONFIG } from '../config';

const VIEWS: { id: CamView; label: string; icon: IconName }[] = [
  { id: 'perspective', label: 'Vue en perspective', icon: 'cube' },
  { id: 'dessus', label: 'Vue de dessus', icon: 'top' },
  { id: 'entree', label: "Vue depuis l'entrée", icon: 'car' },
  { id: 'suivi', label: 'Suivre une voiture', icon: 'eye' },
];

const pref = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const savePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* préférence non conservée */
  }
};

export default function Simulation3D({ go }: { go: (r: Route) => void }) {
  const { data } = useStore();
  const { toast } = useUI();
  const geo = useMemo(() => computeGeometry(data.kv.planConfig), [data.kv.planConfig]);
  const sim = useParkingSim(geo, { trackTime: false });
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<CamView>('perspective');
  const [night, setNight] = useState(() => pref('parkx-3d-night', '0') === '1');
  const [autoRotate, setAutoRotate] = useState(false);
  const [fleet, setFleet] = useState<'mix' | 'az'>(() => (pref('parkx-3d-fleet', 'mix') === 'az' ? 'az' : 'mix'));
  const [hint, setHint] = useState(() => pref('parkx-3d-hint', '0') !== '1');
  const [shot, setShot] = useState('');
  const p3d = useRef<Parking3DHandle>(null);

  useEffect(() => savePref('parkx-3d-night', night ? '1' : '0'), [night]);
  useEffect(() => savePref('parkx-3d-fleet', fleet), [fleet]);
  // Aide affichée une seule fois, quelques secondes
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => {
      setHint(false);
      savePref('parkx-3d-hint', '1');
    }, 7000);
    return () => window.clearTimeout(t);
  }, [hint]);

  // Avant impression : capture de la vue 3D pour le document A4
  useEffect(() => {
    const capture = () => setShot(p3d.current?.snapshot('image/jpeg') || '');
    window.addEventListener('parkx:beforeprint', capture);
    window.addEventListener('beforeprint', capture);
    return () => {
      window.removeEventListener('parkx:beforeprint', capture);
      window.removeEventListener('beforeprint', capture);
    };
  }, []);

  const { running, st, apply } = sim;
  const onToggle = useCallback(
    (n: number) => {
      const s = st(n);
      if (running || s === 'maintenance') return;
      apply(n, s === 'occupe' ? 'libre' : 'occupe', true);
    },
    [running, st, apply]
  );

  const capture = async () => {
    const url = p3d.current?.snapshot('image/png');
    if (!url) return toast('Capture impossible.', 'err');
    downloadBlob(await dataURLToBlob(url), `parkx-simulation-3d-${stamp()}.png`);
    toast('Image de la simulation 3D téléchargée.');
  };

  return (
    <PageShell title="Simulation 3D" icon="cube" orientation="landscape" actions={<SimControlsCompact sim={sim} />}>
      <SimTabs current="simulation" go={go} />
      <Card className={'sim3d-card sim3d-solo no-print ' + (night ? 'night' : '')} pad={false}>
        <div className="p3d-wrap">
          <Parking3D
            ref={p3d}
            geo={geo}
            ledOf={sim.ledOf}
            stateOf={sim.st}
            anims={sim.anims}
            selected={sel}
            testPcb={sim.testPcb}
            night={night}
            view={view}
            autoRotate={autoRotate}
            fleet={fleet}
            onSelect={setSel}
            onToggle={onToggle}
          />

          <div className="p3d-bar" role="toolbar" aria-label="Affichage 3D">
            {VIEWS.map((v) => (
              <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} title={v.label} aria-label={v.label} aria-pressed={view === v.id}>
                <Icon name={v.icon} size={16} />
              </button>
            ))}
            <span className="sep" />
            <button onClick={() => setNight(!night)} title={night ? 'Passer en mode jour' : 'Passer en mode nuit'} aria-label="Jour / nuit" className={night ? 'on' : ''}>
              <Icon name={night ? 'moon' : 'sun'} size={16} />
            </button>
            <button onClick={() => setAutoRotate(!autoRotate)} title="Rotation automatique" aria-label="Rotation automatique" aria-pressed={autoRotate} className={autoRotate ? 'on' : ''} disabled={view === 'suivi'}>
              <Icon name="restore" size={16} />
            </button>
            <button onClick={() => setFleet(fleet === 'az' ? 'mix' : 'az')} title={fleet === 'az' ? `Toutes les voitures : ${CONFIG.voiture.nom} (cliquer pour varier)` : `Voitures variées (cliquer pour n’avoir que des ${CONFIG.voiture.nom})`} aria-pressed={fleet === 'az'} className={'txt ' + (fleet === 'az' ? 'on' : '')}>
              {CONFIG.voiture.nom.split(' ')[0]}
            </button>
            <button onClick={capture} title="Télécharger une image (PNG)" aria-label="Capture">
              <Icon name="camera" size={16} />
            </button>
          </div>

          {sim.running && (
            <div className="p3d-status">
              <i className="pulse" />
              <b>{sim.scenarioLabel}</b>
              {sim.status && <span>{sim.status}</span>}
            </div>
          )}
          {view === 'suivi' && !sim.anims.length && <div className="p3d-hint">En attente d'une voiture en mouvement…</div>}
          {hint && !sim.running && view !== 'suivi' && (
            <div className="p3d-hint soft" onClick={() => setHint(false)}>
              Glisser pour tourner · molette pour zoomer · cliquer sur une place pour changer sa LED
            </div>
          )}

          <LedSummary sim={sim} />
          <PlacePopover sim={sim} geo={geo} selected={sel} onClose={() => setSel(null)} />
        </div>
      </Card>

      <div className="print-only">
        <PrintSummary sim={sim} />
        {shot ? <img className="print-3d" src={shot} alt="Vue 3D de la maquette" /> : <p className="muted">Vue 3D non disponible pour l'impression.</p>}
        <p className="muted small">Vue 3D au moment de l'impression{sim.running ? ` — simulation « ${sim.scenarioLabel} » en cours (états non enregistrés)` : ''}.</p>
      </div>
      <LedStateTable sim={sim} />
    </PageShell>
  );
}
