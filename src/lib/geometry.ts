// Géométrie paramétrique de la maquette. Toutes les valeurs sont en cm.
// Disposition FIXE : rangée supérieure = 12 places classiques ;
// rangée inférieure = 1 place PMR tout à gauche + 11 classiques.
// Numérotation : PMR = 1, puis 2..12 vers la droite (rangée inférieure), puis 13..24 (rangée supérieure, de gauche à droite).
// PCB : 1 PCB pour 2 places consécutives → PCB k = places 2k-1 et 2k.
import type { PlanConfig } from '../db/types';

export const TOP_COUNT = 12;
export const BOTTOM_CLASSIC = 11;
export const TOTAL_PLACES = 24;
export const PCB_COUNT = 12;

export interface PlaceGeo {
  number: number;
  row: 'top' | 'bottom';
  pmr: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  pcb: number;
  entryY: number; // bord d'entrée de la place (côté allée)
  ledY: number; // LED : à l'entrée de la place
  parkY: number; // centre d'une voiture garée (en retrait pour laisser la LED visible)
  numY: number; // numéro de la place
  iconY: number; // pictogramme PMR
}
export interface PcbGeo {
  number: number;
  places: [number, number];
  x: number;
  y: number;
  w: number;
  h: number;
  row: 'top' | 'bottom';
}
export interface Geometry {
  cfg: PlanConfig;
  innerW: number;
  innerH: number;
  ix: number;
  iy: number;
  topLen: number;
  bottomLen: number;
  marginT: number; // marge transversale (chaque côté)
  marginTopRowL: number; // marges longitudinales
  marginBottomRowL: number;
  topRowY: number;
  aisleY: number;
  bottomRowY: number;
  aisleMid: number;
  places: PlaceGeo[];
  pcbs: PcbGeo[];
  errors: string[];
  warnings: string[];
  calcT: string;
  calcL: string[];
}

/** Distance entre la LED et le bord d'entrée de la place (côté allée), en cm. */
export const LED_INSET = 1.2;
/** Longueur des voitures de la simulation : elles laissent libre la bande d'entrée où se trouve la LED. */
export const carLength = (cfg: PlanConfig) => Math.max(3, Math.min(cfg.placeDepth * 0.8, cfg.placeDepth - LED_INSET - 1.25, 9.6));

export const placeToPcb = (n: number) => Math.ceil(n / 2);
export const pcbPlaces = (k: number): [number, number] => [2 * k - 1, 2 * k];

const f = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR');

export function computeGeometry(cfg: PlanConfig): Geometry {
  const { plateW, plateH, border, aisle, placeDepth: d, placeWidth: w, pmrWidth: pw } = cfg;
  const innerW = plateW - 2 * border;
  const innerH = plateH - 2 * border;
  const ix = border;
  const iy = border;
  const topLen = TOP_COUNT * w;
  const bottomLen = pw + BOTTOM_CLASSIC * w;
  const marginT = (innerH - 2 * d - aisle) / 2;
  const marginTopRowL = (innerW - topLen) / 2;
  const marginBottomRowL = (innerW - bottomLen) / 2;
  const topRowY = iy + marginT;
  const aisleY = topRowY + d;
  const bottomRowY = aisleY + aisle;
  const aisleMid = aisleY + aisle / 2;

  const errors: string[] = [];
  const warnings: string[] = [];
  const vals = Object.entries(cfg);
  for (const [k, v] of vals) if (!(Number.isFinite(v) && v > 0)) errors.push(`Valeur invalide pour « ${k} ».`);
  if (innerW <= 0 || innerH <= 0) errors.push('Les bordures sont plus grandes que la plaque.');
  if (marginT < 0) errors.push(`Largeur intérieure insuffisante : il manque ${f(-2 * marginT)} cm (2 rangées + allée).`);
  if (marginTopRowL < 0) errors.push(`Rangée supérieure trop longue : ${f(topLen)} cm pour ${f(innerW)} cm disponibles.`);
  if (marginBottomRowL < 0) errors.push(`Rangée inférieure trop longue : ${f(bottomLen)} cm pour ${f(innerW)} cm disponibles.`);
  if (pw < w) warnings.push('La place PMR est plus étroite qu’une place classique.');
  if (marginT >= 0 && marginT < 2) warnings.push('Marge transversale très faible (< 2 cm).');

  const places: PlaceGeo[] = [];
  const Lc = carLength(cfg);
  // Rangée inférieure : entrée en haut (allée) ; rangée supérieure : entrée en bas (allée)
  const marks = (row: 'top' | 'bottom', y0: number) =>
    row === 'bottom'
      ? { entryY: y0, ledY: y0 + LED_INSET, parkY: y0 + d - Lc / 2 - 0.25, numY: y0 + d * 0.42, iconY: y0 + d * 0.76 }
      : { entryY: y0 + d, ledY: y0 + d - LED_INSET, parkY: y0 + Lc / 2 + 0.25, numY: y0 + d * 0.58, iconY: y0 + d * 0.24 };
  // Rangée inférieure : PMR (n°1) tout à gauche puis 11 classiques (n°2..12)
  let x = ix + marginBottomRowL;
  for (let i = 0; i < 12; i++) {
    const pmr = i === 0;
    const pwid = pmr ? pw : w;
    const n = i + 1;
    places.push({ number: n, row: 'bottom', pmr, x, y: bottomRowY, w: pwid, h: d, cx: x + pwid / 2, cy: bottomRowY + d / 2, pcb: placeToPcb(n), ...marks('bottom', bottomRowY) });
    x += pwid;
  }
  // Rangée supérieure : 12 classiques (n°13..24) de gauche à droite
  x = ix + marginTopRowL;
  for (let i = 0; i < 12; i++) {
    const n = 13 + i;
    places.push({ number: n, row: 'top', pmr: false, x, y: topRowY, w, h: d, cx: x + w / 2, cy: topRowY + d / 2, pcb: placeToPcb(n), ...marks('top', topRowY) });
    x += w;
  }

  const pcbs: PcbGeo[] = [];
  const pcbDepth = Math.max(1.2, Math.min(3, marginT * 0.55 || 1.2));
  for (let k = 1; k <= PCB_COUNT; k++) {
    const [a, b] = pcbPlaces(k);
    const pa = places.find((p) => p.number === a)!;
    const pb = places.find((p) => p.number === b)!;
    const x0 = pa.x + 0.6;
    const x1 = pb.x + pb.w - 0.6;
    const row = pa.row;
    // PCB placé derrière les places (côté marge)
    const y = row === 'top' ? pa.y - pcbDepth - 0.5 : pa.y + pa.h + 0.5;
    pcbs.push({ number: k, places: [a, b], x: x0, y, w: x1 - x0, h: pcbDepth, row });
  }

  const calcT = `${f(innerH)} − ${f(d)} − ${f(aisle)} − ${f(d)} = ${f(innerH - 2 * d - aisle)} cm → ${f(marginT)} cm de marge de chaque côté`;
  const calcL = [
    `Rangée supérieure : 12 × ${f(w)} = ${f(topLen)} cm → marge ${f(marginTopRowL)} cm de chaque côté`,
    `Rangée inférieure : ${f(pw)} + (11 × ${f(w)}) = ${f(bottomLen)} cm → marge ${f(marginBottomRowL)} cm de chaque côté`,
    `Longueur intérieure disponible : ${f(plateW)} − 2 × ${f(border)} = ${f(innerW)} cm`,
  ];

  return { cfg, innerW, innerH, ix, iy, topLen, bottomLen, marginT, marginTopRowL, marginBottomRowL, topRowY, aisleY, bottomRowY, aisleMid, places, pcbs, errors, warnings, calcT, calcL };
}

export function diffConfig(a: PlanConfig, b: PlanConfig) {
  const labels: Record<keyof PlanConfig, string> = {
    plateW: 'Longueur plaque',
    plateH: 'Largeur plaque',
    border: 'Bordures',
    aisle: 'Allée centrale',
    placeDepth: 'Profondeur des places',
    placeWidth: 'Largeur place classique',
    pmrWidth: 'Largeur place PMR',
  };
  return (Object.keys(labels) as (keyof PlanConfig)[])
    .filter((k) => a[k] !== b[k])
    .map((k) => `${labels[k]} : ${f(a[k])} → ${f(b[k])} cm`);
}

export const CONFIG_FIELDS: { key: keyof PlanConfig; label: string; step: number }[] = [
  { key: 'plateW', label: 'Longueur plaque', step: 0.5 },
  { key: 'plateH', label: 'Largeur plaque', step: 0.5 },
  { key: 'border', label: 'Bordures', step: 0.5 },
  { key: 'aisle', label: 'Allée centrale', step: 0.5 },
  { key: 'placeDepth', label: 'Profondeur des places', step: 0.5 },
  { key: 'placeWidth', label: 'Largeur place classique', step: 0.5 },
  { key: 'pmrWidth', label: 'Largeur place PMR', step: 0.5 },
];
