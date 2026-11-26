import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icons';
import type { PcbFab, PcbResult, PcbWiring, Priority, TaskStatus } from '../db/types';

// ---------- Statuts : code couleur du cahier des charges ----------
export type Tone = 'green' | 'blue' | 'orange' | 'red' | 'gray' | 'navy';
export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'À faire', tone: 'gray' },
  doing: { label: 'En cours', tone: 'blue' },
  waiting: { label: 'En attente', tone: 'orange' },
  blocked: { label: 'Bloqué', tone: 'red' },
  done: { label: 'Terminé', tone: 'green' },
  validated: { label: 'Validé', tone: 'green' },
};
export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'waiting', 'blocked', 'done', 'validated'];
export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  basse: { label: 'Basse', tone: 'gray' },
  normale: { label: 'Normale', tone: 'blue' },
  haute: { label: 'Haute', tone: 'orange' },
  critique: { label: 'Critique', tone: 'red' },
};
export const PCB_FAB: Record<PcbFab, { label: string; tone: Tone }> = {
  nc: { label: 'Non commencé', tone: 'gray' },
  encours: { label: 'En cours', tone: 'blue' },
  attente: { label: 'En attente', tone: 'orange' },
  probleme: { label: 'Problème', tone: 'red' },
  termine: { label: 'Terminé', tone: 'green' },
  valide: { label: 'Validé', tone: 'green' },
};
export const PCB_WIRING: Record<PcbWiring, { label: string; tone: Tone }> = {
  nc: { label: 'Non branché', tone: 'gray' },
  partiel: { label: 'Partiel', tone: 'orange' },
  branche: { label: 'Branché', tone: 'green' },
  probleme: { label: 'Problème', tone: 'red' },
};
export const PCB_RESULT: Record<PcbResult, { label: string; tone: Tone }> = {
  '': { label: 'Non testé', tone: 'gray' },
  ok: { label: 'Conforme', tone: 'green' },
  partiel: { label: 'Partiel', tone: 'orange' },
  ko: { label: 'Non conforme', tone: 'red' },
};

export function Badge({ tone = 'gray', children, dot = true }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={'badge t-' + tone}>
      {dot && <i />}
      {children}
    </span>
  );
}
export const DemoTag = () => <span className="demo-tag" title="Donnée de démonstration, non réalisée">DÉMO</span>;

// ---------- Boutons ----------
type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'print' | 'export';
export function Btn({ kind = 'secondary', icon, children, className = '', small, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: IconName; small?: boolean }) {
  return (
    <button type="button" className={`btn btn-${kind} ${small ? 'btn-sm' : ''} ${!children ? 'btn-icon' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={small ? 14 : 15} />}
      {children && <span>{children}</span>}
    </button>
  );
}

// ---------- Menu d'actions ----------
export function ActionMenu({ items }: { items: { label: string; icon: IconName; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <Btn kind="ghost" small icon="dots" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} />
      {open && (
        <div className="menu-pop">
          {items.map((it) => (
            <button key={it.label} className={it.danger ? 'danger' : ''} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}>
              <Icon name={it.icon} size={14} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Menu à cases à cocher ----------
export function ToggleMenu({ label, icon, items }: { label: string; icon: IconName; items: { label: string; checked: boolean; onChange: (v: boolean) => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <Btn small kind="ghost" icon={icon} onClick={() => setOpen(!open)} aria-expanded={open}>{label}</Btn>
      {open && (
        <div className="menu-pop checks">
          {items.map((it) => (
            <label key={it.label}>
              <input type="checkbox" checked={it.checked} onChange={(e) => it.onChange(e.target.checked)} /> {it.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Onglets ----------
export function Tabs<T extends string>({ value, onChange, items, className = '' }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: IconName; count?: number }[]; className?: string }) {
  return (
    <div className={'tabs no-print ' + className} role="tablist">
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className={value === it.id ? 'on' : ''} onClick={() => onChange(it.id)}>
          {it.icon && <Icon name={it.icon} size={14} />}
          {it.label}
          {it.count !== undefined && <span className="tab-n">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Carte à onglets (à l'impression : tous les onglets, chacun avec son titre) ----------
export function TabbedCard({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: { id: string; label: string; icon?: IconName; count?: number; action?: React.ReactNode; content: React.ReactNode; noPrint?: boolean }[];
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const [own, setOwn] = useState(tabs[0]?.id || '');
  const cur = value ?? own;
  const set = onChange ?? setOwn;
  const active = tabs.find((t) => t.id === cur) || tabs[0];
  return (
    <section className={'card tabbed-card ' + className}>
      <div className="card-head tc-head">
        <Tabs value={active?.id || ''} onChange={set} items={tabs.map(({ id, label, icon, count }) => ({ id, label, icon, count }))} className="inline" />
        {active?.action && <div className="card-actions no-print">{active.action}</div>}
      </div>
      <div className="card-body">
        {tabs.map((t) => (
          <div key={t.id} className={'tab-panel' + (t.id === active?.id ? ' on' : '') + (t.noPrint ? ' no-print' : '')} role="tabpanel">
            <h3 className="print-only tp-title">{t.label}</h3>
            {t.content}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Section repliable (toujours dépliée à l'impression) ----------
export function Section({
  title,
  icon,
  summary,
  defaultOpen = false,
  lazy = false,
  actions,
  className = '',
  children,
}: {
  title: string;
  icon?: IconName;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** contenu lourd : construit seulement à l'ouverture (et pas imprimé tant qu'il est replié) */
  lazy?: boolean;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={'fold ' + (open ? 'open ' : '') + (lazy && !open ? 'no-print ' : '') + className}>
      <div className="fold-head">
        <button type="button" className="fold-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="chevR" size={14} className="fold-chev" />
          {icon && <Icon name={icon} size={16} />}
          <span className="fold-title">{title}</span>
          {summary !== undefined && summary !== '' && <span className="fold-sum">{summary}</span>}
        </button>
        {actions && <div className="fold-actions no-print">{actions}</div>}
      </div>
      {(open || !lazy) && <div className="fold-body">{children}</div>}
    </section>
  );
}

// ---------- « Afficher plus » pour les longues listes (tout est imprimé) ----------
export function useShowMore<T>(items: T[], step = 10) {
  const [n, setN] = useState(step);
  useEffect(() => setN(step), [items.length, step]);
  useEffect(() => {
    const all = () => setN(Number.MAX_SAFE_INTEGER);
    const back = () => setN(step);
    window.addEventListener('parkx:beforeprint', all);
    window.addEventListener('afterprint', back);
    return () => {
      window.removeEventListener('parkx:beforeprint', all);
      window.removeEventListener('afterprint', back);
    };
  }, [step]);
  const visible = items.slice(0, n);
  const rest = items.length - visible.length;
  const control =
    items.length > step ? (
      <div className="show-more no-print">
        {rest > 0 ? (
          <Btn small icon="chevD" onClick={() => setN(n + step * 2)}>Afficher plus ({rest})</Btn>
        ) : (
          <Btn small kind="ghost" icon="chevU" onClick={() => setN(step)}>Réduire la liste</Btn>
        )}
      </div>
    ) : null;
  return { visible, control, rest };
}

/** Vrai pendant une impression lancée par le bouton « Imprimer A4 » (pour imprimer les listes en entier). */
export function usePrinting() {
  const [p, setP] = useState(false);
  useEffect(() => {
    const on = () => setP(true);
    const off = () => setP(false);
    window.addEventListener('parkx:beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('parkx:beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  return p;
}

// ---------- Fiche de détails (lignes vides masquées) ----------
export function InfoList({ rows, empty = 'Aucune information complémentaire.' }: { rows: [string, React.ReactNode][]; empty?: string }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);
  if (!shown.length) return <p className="muted small">{empty}</p>;
  return (
    <dl className="info-list">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Modale ----------
export function Modal({ title, onClose, children, footer, wide, icon }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; icon?: IconName }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + (wide ? 'modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {icon && <span className="modal-ic"><Icon name={icon} size={16} /></span>}
          <h3>{title}</h3>
          <Btn kind="ghost" small icon="x" aria-label="Fermer" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Champs ----------
export function Field({ label, children, full, error, hint }: { label: string; children: React.ReactNode; full?: boolean; error?: string; hint?: string }) {
  return (
    <label className={'field ' + (full ? 'full ' : '') + (error ? 'has-error' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}

export function Empty({ icon = 'info', title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, tone = 'blue', label }: { value: number; tone?: Tone; label?: boolean }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="progress-wrap">
      <div className={'progress t-' + tone} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: v + '%' }} />
      </div>
      {label && <span className="progress-val">{Math.round(v)} %</span>}
    </div>
  );
}

// ---------- Notifications & confirmations ----------
interface Toast { id: number; text: string; tone: 'ok' | 'err' | 'info' }
interface ConfirmReq { title: string; text: React.ReactNode; confirm?: string; danger?: boolean; resolve: (v: boolean) => void }
const UICtx = createContext<{ toast: (t: string, tone?: Toast['tone']) => void; confirm: (o: Omit<ConfirmReq, 'resolve'>) => Promise<boolean> } | null>(null);
export const useUI = () => useContext(UICtx)!;

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const confirm = useCallback((o: Omit<ConfirmReq, 'resolve'>) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), []);
  const close = (v: boolean) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts no-print" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast toast-' + t.tone}>
            <Icon name={t.tone === 'err' ? 'alert' : t.tone === 'info' ? 'info' : 'check'} size={15} />
            {t.text}
          </div>
        ))}
      </div>
      {req && (
        <Modal
          title={req.title}
          icon={req.danger ? 'alert' : 'info'}
          onClose={() => close(false)}
          footer={
            <>
              <Btn onClick={() => close(false)}>Annuler</Btn>
              <Btn kind={req.danger ? 'danger' : 'primary'} icon={req.danger ? 'trash' : 'check'} onClick={() => close(true)} autoFocus>
                {req.confirm || 'Confirmer'}
              </Btn>
            </>
          }
        >
          <div className="confirm-text">{req.text}</div>
        </Modal>
      )}
    </UICtx.Provider>
  );
}

// ---------- Tri de tableau ----------
export function useSort<T>(rows: T[], initial: { key: keyof T | string; dir: 1 | -1 }, getters: Record<string, (r: T) => any> = {}) {
  const [sort, setSort] = useState(initial);
  const get = (r: T) => (getters[sort.key as string] ? getters[sort.key as string](r) : (r as any)[sort.key]);
  const sorted = [...rows].sort((a, b) => {
    const x = get(a) ?? '';
    const y = get(b) ?? '';
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { numeric: true })) * sort.dir;
  });
  const th = (key: string, label: string, cls = '') => (
    <th className={'sortable ' + cls} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label}
      <span className="sort-ind">{sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
    </th>
  );
  return { sorted, th };
}
