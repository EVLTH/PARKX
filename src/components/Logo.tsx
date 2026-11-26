// Logo officiel ParkX — intégré tel quel (image fournie), sans redessin ni modification de proportions ou de couleurs.
// Seuls le cadrage blanc extérieur a été retiré et le fond rendu transparent.
import logoUrl from '../assets/parkx-logo.webp';
import { CONFIG } from '../config';

export const LOGO_ALT = 'ParkX – la solution solaire pour tous';
export const LOGO_RATIO = 958 / 952; // largeur / hauteur du logo recadré

export function Logo({ height, width, className = '' }: { height?: number; width?: number; className?: string }) {
  const h = height ?? (width ? width / LOGO_RATIO : 64);
  const w = width ?? h * LOGO_RATIO;
  return <img src={CONFIG.logo || logoUrl} alt={LOGO_ALT} width={Math.round(w)} height={Math.round(h)} className={'logo-img ' + className} draggable={false} />;
}
