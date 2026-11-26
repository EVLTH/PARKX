// Impression A4 : injecte une règle @page propre à la rubrique (orientation, en-têtes, pagination, signature)
// puis lance l'impression native du navigateur. Le contenu imprimé est défini par styles/print.css.
import { SIGNATURE } from '../db/types';
import { BRAND } from '../styles/brand';

export type Orientation = 'portrait' | 'landscape';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

export function printSection(opts: { title: string; orientation: Orientation; project: string; version?: string }): boolean {
  window.dispatchEvent(new Event('parkx:beforeprint')); // ex. capture de la vue 3D
  const date = new Date().toLocaleDateString('fr-FR');
  const prev = document.getElementById('parkx-page-style');
  prev?.remove();
  const style = document.createElement('style');
  style.id = 'parkx-page-style';
  const box = 'font-family: system-ui, "Segoe UI", Arial, sans-serif; font-size: 7.5pt; color: #475569;';
  style.textContent = `
@page {
  size: A4 ${opts.orientation};
  margin: 14mm 12mm 15mm 12mm;
  @top-left { content: "PARKX · ${esc(opts.title)}"; ${box} }
  @top-right { content: "${esc(opts.project)} · ${date}${opts.version ? ' · v' + esc(opts.version) : ''}"; ${box} }
  @bottom-left { content: "${SIGNATURE}"; ${box} font-weight: 600; color: ${BRAND.navy}; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); ${box} }
}
@page :first { @top-left { content: none; } @top-right { content: none; } }`;
  document.head.appendChild(style);
  document.documentElement.dataset.printOrientation = opts.orientation;
  const prevTitle = document.title;
  document.title = `PARKX - ${opts.title} - ${date}`;
  const cleanup = () => {
    document.title = prevTitle;
    delete document.documentElement.dataset.printOrientation;
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    // Laisse le navigateur appliquer la feuille avant d'ouvrir la boîte d'impression
    requestAnimationFrame(() => setTimeout(() => window.print(), 160));
    return true;
  } catch {
    cleanup();
    return false;
  }
}
