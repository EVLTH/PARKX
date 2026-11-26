import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icons';
import { Logo } from './Logo';
import { useStore } from '../db/store';
import { normalize, pcbLabel } from '../lib/utils';
import { CONFIG } from '../config';

export type Route = 'dashboard' | 'presentation' | 'conception' | 'schema' | 'simulation' | 'fabrication' | 'pcb' | 'galerie' | 'documents' | 'journal' | 'sauvegarde' | 'parametres';

export const NAV: { id: Route; label: string; short: string; icon: IconName; group?: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord', short: 'Tableau de bord', icon: 'dashboard', group: 'Pilotage' },
  { id: 'presentation', label: 'Présentation du projet', short: 'Projet', icon: 'info' },
  { id: 'conception', label: 'Conception et plans', short: 'Plans', icon: 'ruler', group: 'Conception' },
  { id: 'schema', label: 'Schéma dynamique', short: 'Schéma 2D', icon: 'live' },
  { id: 'simulation', label: 'Simulation 3D', short: 'Simulation 3D', icon: 'cube' },
  { id: 'fabrication', label: 'Suivi de fabrication', short: 'Fabrication', icon: 'tasks', group: 'Fabrication' },
  { id: 'pcb', label: 'Électricité et PCB', short: 'PCB', icon: 'cpu' },
  { id: 'galerie', label: 'Galerie photos', short: 'Photos', icon: 'image', group: 'Documentation' },
  { id: 'documents', label: 'Documents techniques', short: 'Documents', icon: 'folder' },
  { id: 'journal', label: 'Journal de projet', short: 'Journal', icon: 'book' },
  { id: 'sauvegarde', label: 'Sauvegarde', short: 'Sauvegarde', icon: 'shield', group: 'Système' },
  { id: 'parametres', label: 'Paramètres', short: 'Paramètres', icon: 'settings' },
];

export function Sidebar({ route, go, collapsed, setCollapsed, mobileOpen, closeMobile }: { route: Route; go: (r: Route) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen: boolean; closeMobile: () => void }) {
  return (
    <>
      {mobileOpen && <div className="sb-overlay no-print" onClick={closeMobile} />}
      <aside className={`sidebar no-print ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sb-brand" onClick={() => go('dashboard')} role="button" tabIndex={0}>
          <Logo width={124} />
          <span className="sb-brand-txt">Suivi de projet</span>
        </div>
        <nav className="sb-nav">
          {NAV.map((n, i) => (
            <div key={n.id}>
              {n.group && i > 0 && <div className="sb-sep" />}
              <button className={'sb-item ' + (route === n.id ? 'active' : '')} onClick={() => go(n.id)} title={collapsed ? n.label : undefined} aria-current={route === n.id ? 'page' : undefined}>
                <Icon name={n.icon} size={17} />
                <span>{CONFIG.menu[n.id] || n.short}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <button className="sb-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Déplier le menu' : 'Réduire le menu'} aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}>
            <Icon name={collapsed ? 'chevR' : 'chevL'} size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

interface Hit { route: Route; id?: string; type: string; label: string; sub: string }

export function Topbar({ route, go, openMobile }: { route: Route; go: (r: Route, id?: string) => void; openMobile: () => void }) {
  const { data, user, sync, saveInfo, storage } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', k);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const n = normalize(q.trim());
    if (n.length < 2) return [];
    const m = (...s: string[]) => s.some((x) => normalize(x || '').includes(n));
    const out: Hit[] = [];
    data.tasks.forEach((t) => m(t.name, t.description, t.category, t.responsible, t.comments) && out.push({ route: 'fabrication', id: t.id, type: 'Tâche', label: t.name, sub: t.category }));
    data.pcbs.forEach((p) => m(pcbLabel(p.number), 'pcb' + p.number, p.reference, p.func, p.problems, p.comments) && out.push({ route: 'pcb', id: p.id, type: 'PCB', label: pcbLabel(p.number), sub: `Places ${2 * p.number - 1} et ${2 * p.number}` }));
    data.photos.forEach((p) => m(p.name, p.description, p.category) && out.push({ route: 'galerie', id: p.id, type: 'Photo', label: p.name || p.description, sub: p.category }));
    data.documents.forEach((d) => m(d.name, d.description, d.category) && out.push({ route: 'documents', id: d.id, type: 'Document', label: d.name, sub: d.category }));
    data.journal.forEach((j) => m(j.title, j.description, j.category, j.author) && out.push({ route: 'journal', id: j.id, type: 'Journal', label: j.title, sub: j.category }));
    for (let i = 1; i <= 24; i++) if (m('place ' + i, 'n°' + i)) out.push({ route: 'conception', id: 'place-' + i, type: 'Place', label: 'Place n°' + i + (i === 1 ? ' (PMR)' : ''), sub: pcbLabel(Math.ceil(i / 2)) });
    return out.slice(0, 14);
  }, [q, data]);

  return (
    <header className="topbar no-print">
      <button className="tb-burger" onClick={openMobile} aria-label="Ouvrir le menu">
        <Icon name="menu" size={20} />
      </button>
      <div className="tb-search" ref={ref}>
        <Icon name="search" size={15} />
        <input
          value={q}
          placeholder="Rechercher une tâche, un PCB, une photo…"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label="Recherche globale"
        />
        <kbd>Ctrl K</kbd>
        {open && q.trim().length >= 2 && (
          <div className="search-pop">
            {hits.length === 0 && <div className="search-none">Aucun résultat pour « {q} »</div>}
            {hits.map((h, i) => (
              <button
                key={i}
                onClick={() => {
                  go(h.route, h.id);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className="sr-type">{h.type}</span>
                <span className="sr-label">{h.label}</span>
                <span className="sr-sub">{h.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tb-right">
        {(() => {
          const hm = (d: string) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
          const syncLabel: Record<string, string> = {
            connecting: 'Synchronisation en cours',
            synced: 'Synchronisé',
            pending: 'Synchronisation en cours',
            offline: 'Hors ligne',
            auth: sync.backend === 'firebase' ? 'Connexion requise' : 'Code requis',
            error: 'Erreur de synchronisation',
            local: 'Enregistré',
          };
          let st: string, label: string, tip: string, time = '';
          if (storage.mode === 'memory') {
            st = 'memory';
            label = 'Non enregistré';
            tip = "Ce navigateur n'autorise pas l'enregistrement ici (" + storage.reason + ') : les données seront perdues à la fermeture';
          } else if (saveInfo.state === 'error') {
            st = 'error';
            label = "Erreur d'enregistrement";
            tip = 'La dernière modification n’a pas été enregistrée : ' + saveInfo.error;
          } else if (saveInfo.state === 'saving') {
            st = 'pending';
            label = 'Enregistrement…';
            tip = 'Enregistrement en cours dans ce navigateur';
          } else if (sync.mode === 'remote') {
            st = sync.state;
            label = syncLabel[sync.state];
            tip = sync.state === 'synced' ? `Enregistré et partagé avec l'équipe — dernière synchronisation à ${hm(sync.lastSync)}` : sync.message || label;
          } else {
            st = 'local';
            label = 'Enregistré';
            time = 'local' + (saveInfo.at ? ' · ' + hm(saveInfo.at) : '');
            tip =
              'Synchronisation non configurée : PARKX fonctionne uniquement en local, les données sont enregistrées dans ce navigateur' +
              (saveInfo.at ? ' (dernier enregistrement à ' + hm(saveInfo.at) + ')' : '');
          }
          return (
            <button className={'tb-saved s-' + st} data-state={st} onClick={() => go('sauvegarde')} title={tip + ' — ouvrir la page Sauvegarde'}>
              <i /> <span className="tb-lbl">{label}</span>
              {time && <small className="tb-time">{time}</small>}
            </button>
          );
        })()}
        <button className="tb-btn" onClick={() => go('parametres')} title="Paramètres">
          <Icon name="settings" size={16} />
        </button>
        <span className="tb-user" title="Contributeur actuel"><Icon name="user" size={14} />{user}</span>
      </div>
    </header>
  );
}
