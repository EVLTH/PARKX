// Réglages modifiables sans programmation : lus dans « reglages.js » (window.PARKX_REGLAGES) au démarrage.
// Ce module doit être importé en premier (voir main.tsx) pour que les couleurs s'appliquent partout.
import { BRAND, LED } from './styles/brand';
import { REFERENCE_PLAN, type PlanConfig } from './db/types';

export interface Reglages {
  logo?: string;
  couleurs?: Partial<Record<'bleuNuit' | 'bleuFonce' | 'bleu' | 'bleuClair' | 'vert' | 'vertFonce' | 'vertClair' | 'citron' | 'jaune' | 'orange' | 'rouge', string>>;
  led?: Partial<Record<'libre' | 'occupe' | 'maintenance', string>>;
  menu?: Partial<Record<string, string>>;
  voiture?: { nom?: string; couleurBandes?: string; uneSur?: number };
  reference?: Partial<PlanConfig>;
  serveur?: { actif?: boolean; adresse?: string; intervalle?: number };
  firebase?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    appId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    emailEquipe?: string;
    projet?: string;
    /** pour les essais sur un ordinateur : émulateurs Firebase locaux */
    emulateur?: { firestore?: string; auth?: string };
  };
}

const raw: Reglages = (typeof window !== 'undefined' && (window as any).PARKX_REGLAGES) || {};
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

// Couleurs : nom du réglage -> clé interne + variable CSS
const COLOR_MAP: Record<string, { brand: keyof typeof BRAND; css: string }> = {
  bleuNuit: { brand: 'navy', css: '--logo-navy' },
  bleuFonce: { brand: 'deep', css: '--logo-deep' },
  bleu: { brand: 'blue', css: '--logo-blue' },
  bleuClair: { brand: 'sky', css: '--logo-sky' },
  vert: { brand: 'green', css: '--logo-green' },
  vertFonce: { brand: 'forest', css: '--logo-forest' },
  vertClair: { brand: 'greenLight', css: '--logo-green-light' },
  citron: { brand: 'lime', css: '--logo-lime' },
  jaune: { brand: 'gold', css: '--logo-gold' },
  orange: { brand: 'orange', css: '--logo-orange' },
  rouge: { brand: 'red', css: '--status-red' },
};

for (const [k, v] of Object.entries(raw.couleurs || {})) {
  const m = COLOR_MAP[k];
  if (m && isHex(v)) {
    (BRAND as any)[m.brand] = v.trim();
    document.documentElement.style.setProperty(m.css, v.trim());
  }
}
// LED : par défaut dérivées de la palette, ou fixées explicitement
LED.libre = isHex(raw.led?.libre) ? raw.led!.libre!.trim() : BRAND.greenLight;
LED.occupe = isHex(raw.led?.occupe) ? raw.led!.occupe!.trim() : BRAND.red;
LED.maintenance = isHex(raw.led?.maintenance) ? raw.led!.maintenance!.trim() : BRAND.sky;

// Dimensions de référence du cahier des charges
for (const [k, v] of Object.entries(raw.reference || {})) {
  if (k in REFERENCE_PLAN && typeof v === 'number' && v > 0) (REFERENCE_PLAN as any)[k] = v;
}

export const CONFIG = {
  logo: typeof raw.logo === 'string' && raw.logo.trim() ? raw.logo.trim() : '',
  menu: raw.menu || {},
  voiture: {
    nom: (raw.voiture?.nom || 'AZ computer28').trim(),
    couleurBandes: isHex(raw.voiture?.couleurBandes) ? raw.voiture!.couleurBandes!.trim() : '#8DB83E',
    uneSur: Math.max(1, Math.round(Number(raw.voiture?.uneSur) || 3)),
  },
  serveur: {
    actif: raw.serveur?.actif !== false,
    adresse: (raw.serveur?.adresse || 'api.php').trim(),
    intervalle: Math.max(3, Number(raw.serveur?.intervalle) || 10),
  },
  firebase: firebaseConfig(),
};

/** Synchronisation Firebase : active seulement si la clé et l'identifiant du projet sont renseignés. */
function firebaseConfig() {
  const f = raw.firebase || {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const apiKey = str(f.apiKey);
  const projectId = str(f.projectId);
  const projet = str(f.projet).replace(/[^A-Za-z0-9_-]/g, '') || 'maquette';
  return {
    actif: !!(apiKey && projectId),
    options: { apiKey, projectId, authDomain: str(f.authDomain) || (projectId ? projectId + '.firebaseapp.com' : ''), appId: str(f.appId) || undefined },
    // Firebase enregistre les adresses en minuscules (comparaison avec les règles Firestore)
    emailEquipe: str(f.emailEquipe).toLowerCase(),
    projet,
    emulateur: { firestore: str(f.emulateur?.firestore), auth: str(f.emulateur?.auth) },
  };
}
