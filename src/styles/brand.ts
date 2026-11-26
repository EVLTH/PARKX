// Couleurs officielles relevées sur le logo ParkX (logo/parkx-logo-officiel.png).
// Elles sont reprises à l'identique dans src/styles/theme.css (variables CSS).
export const BRAND: Record<'navy' | 'deep' | 'blue' | 'sky' | 'green' | 'greenLight' | 'lime' | 'forest' | 'sun' | 'gold' | 'orange' | 'red' | 'gray' | 'ink' | 'muted' | 'line', string> = {
  navy: '#002A52', // lettrage « Park » et slogan
  deep: '#00437D', // voiture, poteaux de l'abri
  blue: '#086DAF', // panneaux solaires (ton moyen)
  sky: '#1189CF', // panneaux solaires (reflet clair)
  green: '#378827', // colline
  greenLight: '#5AA818', // colline (crête)
  lime: '#8EC513', // X (haut)
  forest: '#0F7435', // X (bas)
  sun: '#FFDB2A', // soleil
  gold: '#FEC410', // soleil / rayons
  orange: '#F38513', // soleil (bas)
  red: '#DC2626', // statut « bloqué / problème » (cahier des charges)
  gray: '#94A3B8', // statut « non commencé »
  ink: '#0F172A',
  muted: '#64748B',
  line: '#E2E8F0',
};

/** Couleurs des LED du schéma dynamique (vert libre, rouge occupé, bleu maintenance). */
export const LED = { libre: BRAND.greenLight as string, occupe: BRAND.red as string, maintenance: BRAND.sky as string };
