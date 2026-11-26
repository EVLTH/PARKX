// État partagé de la simulation (états des LED, voitures en mouvement, scénarios).
// Les états modifiés à la main sont enregistrés ; ceux d'un scénario ne le sont jamais.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../db/store';
import type { LedState } from '../db/types';
import type { Geometry } from './geometry';
import { pcbPlaces } from './geometry';
import { LED_LABEL, makeAnim, SCENARIOS, type Anim, type Scenario } from './parkingSim';

const ALL = Array.from({ length: 24 }, (_, i) => i + 1);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export function useParkingSim(geo: Geometry, opts: { trackTime?: boolean } = {}) {
  const { data, setKV } = useStore();
  const saved = data.kv.led;
  const [states, setStates] = useState<Record<number, LedState>>(() => ({ ...saved }));
  const [override, setOverride] = useState<Record<number, LedState>>({}); // couleurs affichées seules (test LED)
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [status, setStatus] = useState('');
  const [testPcb, setTestPcb] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [anims, setAnims] = useState<Anim[]>([]);
  const [now, setNow] = useState(() => performance.now());

  const statesRef = useRef(states);
  statesRef.current = states;
  const animsRef = useRef(anims);
  animsRef.current = anims;
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const running = scenario !== null;

  // Hors scénario, l'affichage suit les états enregistrés
  useEffect(() => {
    if (!running) setStates({ ...saved });
  }, [saved, running]);

  // Nettoyage des animations terminées (+ horloge pour le rendu SVG)
  useEffect(() => {
    if (!anims.length) return;
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      if (opts.trackTime !== false) setNow(t);
      if (animsRef.current.some((a) => t - a.start >= a.dur)) setAnims((as) => as.filter((a) => t - a.start < a.dur));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anims.length, opts.trackTime]);

  const st = useCallback((n: number): LedState => states[n] || 'libre', [states]);
  const ledOf = useCallback((n: number): LedState => override[n] || states[n] || 'libre', [override, states]);

  /** Change l'état d'une place (avec arrivée / départ animé d'une voiture). */
  const apply = useCallback(
    (n: number, next: LedState, persist: boolean) => {
      const prev = statesRef.current[n] || 'libre';
      if (prev === next) return;
      const g = geoRef.current;
      const p = g.places.find((x) => x.number === n);
      if (p && g.errors.length === 0) {
        if (next === 'occupe') setAnims((as) => [...as.filter((a) => a.place !== n), makeAnim(g, p, 'in', speedRef.current)]);
        else if (prev === 'occupe') setAnims((as) => [...as.filter((a) => a.place !== n), makeAnim(g, p, 'out', speedRef.current)]);
      }
      const ns = { ...statesRef.current, [n]: next };
      statesRef.current = ns;
      setStates(ns);
      if (persist) setKV('led', ns, `Place n°${n} → ${LED_LABEL[next]}`);
    },
    [setKV]
  );

  /** Libère ou occupe toutes les places (hors maintenance), voiture par voiture. */
  const bulk = useCallback(
    (target: 'libre' | 'occupe') => {
      const list = ALL.filter((i) => (statesRef.current[i] || 'libre') !== 'maintenance' && (statesRef.current[i] || 'libre') !== target);
      if (!list.length) return;
      list.forEach((n, k) =>
        setTimeout(() => {
          apply(n, target, false);
          if (k === list.length - 1) setKV('led', { ...statesRef.current }, target === 'libre' ? 'Toutes les places libérées' : 'Toutes les places occupées');
        }, k * 140)
      );
    },
    [apply, setKV]
  );

  const reset = useCallback(() => {
    const ns: Record<number, LedState> = {};
    ALL.forEach((i) => (ns[i] = 'libre'));
    setAnims([]);
    statesRef.current = ns;
    setStates(ns);
    setKV('led', ns, 'Schéma réinitialisé');
  }, [setKV]);

  const start = useCallback((s: Scenario) => {
    setAnims([]);
    setOverride({});
    setTestPcb(null);
    setStatus('');
    setScenario(s);
  }, []);

  const stop = useCallback(() => {
    setScenario(null);
    setAnims([]);
    setOverride({});
    setTestPcb(null);
    setStatus('');
    statesRef.current = { ...saved };
    setStates({ ...saved });
  }, [saved]);

  // ---------- Scénarios (non enregistrés) ----------
  useEffect(() => {
    if (!scenario) return;
    const busy = () => new Set(animsRef.current.map((a) => a.place));
    const lists = () => {
      const b = busy();
      const free: number[] = [],
        occ: number[] = [];
      for (const i of ALL) {
        if (b.has(i)) continue;
        const v = statesRef.current[i] || 'libre';
        if (v === 'libre') free.push(i);
        if (v === 'occupe') occ.push(i);
      }
      return { free, occ };
    };
    let timer = 0;

    if (scenario === 'test-led') {
      // Séquence PCB 01 → 12 : vert, rouge, bleu, puis retour à l'état réel
      const steps: (() => void)[] = [];
      for (let k = 1; k <= 12; k++) {
        const [a, b] = pcbPlaces(k);
        (['libre', 'occupe', 'maintenance'] as LedState[]).forEach((c) =>
          steps.push(() => {
            setTestPcb(k);
            setStatus(`PCB ${String(k).padStart(2, '0')} – places ${a} et ${b} : ${LED_LABEL[c]}`);
            setOverride((o) => ({ ...o, [a]: c, [b]: c }));
          })
        );
        steps.push(() =>
          setOverride((o) => {
            const n = { ...o };
            delete n[a];
            delete n[b];
            return n;
          })
        );
      }
      let i = 0;
      timer = window.setInterval(() => {
        if (i < steps.length) steps[i++]();
        else {
          window.clearInterval(timer);
          setTestPcb(null);
          setStatus('Test terminé : les 12 PCB et leurs 24 LED ont été parcourus.');
        }
      }, 520 / speed);
      return () => window.clearInterval(timer);
    }

    let tickCount = 0;
    let maintPcb: number | null = null;
    const tick = () => {
      tickCount++;
      const { free, occ } = lists();
      if (scenario === 'pointe') {
        if (free.length) apply(pick(free), 'occupe', false);
        setStatus(free.length > 1 ? `${24 - free.length + 1} places occupées ou en cours d’occupation` : 'Parking complet');
        return;
      }
      if (scenario === 'depart') {
        if (occ.length) apply(pick(occ), 'libre', false);
        setStatus(occ.length > 1 ? `${occ.length - 1} voiture(s) encore garée(s)` : 'Parking vide');
        return;
      }
      if (scenario === 'maintenance' && tickCount % 7 === 1) {
        // fin de la maintenance précédente, puis nouveau PCB en maintenance
        if (maintPcb) pcbPlaces(maintPcb).forEach((n) => apply(n, 'libre', false));
        maintPcb = 1 + Math.floor(Math.random() * 12);
        const [a, b] = pcbPlaces(maintPcb);
        apply(a, 'maintenance', false);
        apply(b, 'maintenance', false);
        setTestPcb(maintPcb);
        setStatus(`PCB ${String(maintPcb).padStart(2, '0')} en maintenance : places ${a} et ${b} indisponibles`);
        return;
      }
      // trafic aléatoire (aussi utilisé pendant la maintenance)
      const arrive = free.length && (Math.random() < 0.62 || !occ.length);
      if (arrive) apply(pick(free), 'occupe', false);
      else if (occ.length) apply(pick(occ), 'libre', false);
      if (scenario === 'aleatoire') setStatus('');
    };
    const base = scenario === 'pointe' || scenario === 'depart' ? 1500 : 2300;
    tick();
    timer = window.setInterval(tick, base / speed);
    return () => window.clearInterval(timer);
  }, [scenario, speed, apply]);

  const counts = useMemo(() => {
    const c = { libre: 0, occupe: 0, maintenance: 0 };
    for (const i of ALL) c[ledOf(i)]++;
    return c;
  }, [ledOf]);
  const animPlaces = useMemo(() => new Set(anims.map((a) => a.place)), [anims]);

  return {
    states,
    st,
    ledOf,
    apply,
    bulk,
    reset,
    scenario,
    scenarioLabel: scenario ? SCENARIOS[scenario].label : '',
    status,
    testPcb,
    start,
    stop,
    running,
    speed,
    setSpeed,
    anims,
    animPlaces,
    now,
    counts,
  };
}
export type ParkingSim = ReturnType<typeof useParkingSim>;
