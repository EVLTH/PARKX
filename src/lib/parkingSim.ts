// Moteur de simulation partagé par le schéma 2D et la simulation 3D.
// Trajectoires calculées en cm dans le repère du plan (x vers la droite, y vers le bas).
// Simulation de la signalisation de la maquette — ce n'est pas un système de gestion de parking réel.
import type { LedState } from '../db/types';
import type { Geometry, PlaceGeo } from './geometry';
import { BRAND } from '../styles/brand';

export const CAR_COLORS = ['#334155', BRAND.deep, '#F8FAFC', '#64748B', '#0F172A', '#B91C1C', '#CBD5E1', BRAND.blue];

export interface KF {
  x: number;
  y: number;
  a: number; // cap en degrés (0 = vers la droite, 90 = vers le bas)
}
export interface Anim {
  place: number;
  kind: 'in' | 'out';
  start: number;
  path: KF[];
  lens: number[];
  total: number;
  dur: number;
}

export const LED_LABEL: Record<LedState, string> = { libre: 'Libre', occupe: 'Occupé', maintenance: 'Maintenance' };

export type Scenario = 'aleatoire' | 'pointe' | 'depart' | 'test-led' | 'maintenance';
export const SCENARIOS: Record<Scenario, { label: string; desc: string }> = {
  aleatoire: { label: 'Trafic aléatoire', desc: 'Arrivées et départs au hasard, en continu.' },
  pointe: { label: 'Heure de pointe', desc: 'Les voitures arrivent une à une jusqu’à remplir le parking.' },
  depart: { label: 'Fin de journée', desc: 'Les voitures quittent le parking une à une jusqu’à ce qu’il soit vide.' },
  'test-led': { label: 'Test des LED (PCB 01 → 12)', desc: 'Chaque PCB allume ses 2 places en vert, puis rouge, puis bleu — sans voiture.' },
  maintenance: { label: 'Maintenance d’un PCB', desc: 'Un PCB passe en maintenance (2 places bleues) pendant que le trafic continue.' },
};
export const SCENARIO_ORDER: Scenario[] = ['aleatoire', 'pointe', 'depart', 'test-led', 'maintenance'];

/** Trajet d'entrée : arrivée par la droite dans l'allée, virage, puis marche avant dans la place. */
export function entryPath(geo: Geometry, p: PlaceGeo): KF[] {
  const r = Math.max(1.5, Math.min(geo.cfg.aisle * 0.4, 6, p.w));
  const ym = geo.aisleMid;
  const pts: KF[] = [
    { x: geo.cfg.plateW + 10, y: ym, a: 180 },
    { x: p.cx + r, y: ym, a: 180 },
  ];
  const N = 12;
  if (p.row === 'top') {
    const C = { x: p.cx + r, y: ym - r };
    for (let i = 1; i <= N; i++) {
      const t = ((90 + (90 * i) / N) * Math.PI) / 180;
      pts.push({ x: C.x + r * Math.cos(t), y: C.y + r * Math.sin(t), a: (t * 180) / Math.PI + 90 });
    }
    pts.push({ x: p.cx, y: p.parkY, a: 270 });
  } else {
    const C = { x: p.cx + r, y: ym + r };
    for (let i = 1; i <= N; i++) {
      const t = ((270 - (90 * i) / N) * Math.PI) / 180;
      pts.push({ x: C.x + r * Math.cos(t), y: C.y + r * Math.sin(t), a: (t * 180) / Math.PI - 90 });
    }
    pts.push({ x: p.cx, y: p.parkY, a: 90 });
  }
  return pts;
}

/** Trajet de sortie : marche arrière jusqu'à l'allée puis départ vers la gauche. */
export function exitPath(geo: Geometry, p: PlaceGeo): KF[] {
  const e = entryPath(geo, p).slice(1).reverse();
  return [...e, { x: -12, y: geo.aisleMid, a: 180 }];
}

export function makeAnim(geo: Geometry, p: PlaceGeo, kind: 'in' | 'out', speed: number): Anim {
  const path = kind === 'in' ? entryPath(geo, p) : exitPath(geo, p);
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const total = lens[lens.length - 1];
  return { place: p.number, kind, start: performance.now(), path, lens, total, dur: (600 + total * 32) / speed };
}

/** Position d'une voiture à l'instant `now` (accélération / décélération douces). */
export function animAt(a: Anim, now: number): KF {
  let t = Math.min(1, Math.max(0, (now - a.start) / a.dur));
  t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const d = t * a.total;
  let i = 1;
  while (i < a.lens.length - 1 && a.lens[i] < d) i++;
  const k = (d - a.lens[i - 1]) / (a.lens[i] - a.lens[i - 1] || 1);
  const p0 = a.path[i - 1],
    p1 = a.path[i];
  return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, a: p0.a + (p1.a - p0.a) * k };
}

/** La voiture recule-t-elle à cet instant ? (première partie d'une sortie) */
export const isReversing = (a: Anim, now: number) => a.kind === 'out' && (now - a.start) / a.dur < 0.45;
