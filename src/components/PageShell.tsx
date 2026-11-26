import React from 'react';
import { useStore } from '../db/store';
import { SIGNATURE } from '../db/types';
import { printSection, type Orientation } from '../lib/print';
import { Logo } from './Logo';
import { Icon, type IconName } from './Icons';
import { useUI } from './ui';

export function PrintButton({ title, orientation }: { title: string; orientation: Orientation }) {
  const { data } = useStore();
  const { toast } = useUI();
  return (
    <button
      type="button"
      className="btn btn-print btn-sm"
      title={`Imprimer cette rubrique au format A4 ${orientation === 'landscape' ? 'paysage' : 'portrait'}`}
      onClick={() => {
        const ok = printSection({ title, orientation, project: data.kv.project.name, version: data.kv.project.docVersion });
        if (!ok) toast("L'impression n'a pas pu être lancée par le navigateur.", 'err');
      }}
    >
      <Icon name="print" size={14} />
      <span>Imprimer A4</span>
    </button>
  );
}

export function PageShell({
  title,
  icon,
  subtitle,
  orientation = 'portrait',
  actions,
  children,
  printTitle,
}: {
  title: string;
  icon: IconName;
  subtitle?: string;
  orientation?: Orientation;
  actions?: React.ReactNode;
  children: React.ReactNode;
  printTitle?: string;
}) {
  const { data } = useStore();
  const p = data.kv.project;
  return (
    <div className="page" data-orientation={orientation}>
      <div className="page-head no-print">
        <div className="page-title">
          <span className="page-ic"><Icon name={icon} size={18} /></span>
          <div>
            <h1>{title}</h1>
          </div>
        </div>
        <div className="page-actions">
          {actions}
          <PrintButton title={printTitle || title} orientation={orientation} />
        </div>
      </div>

      <header className="print-head print-only">
        <Logo height={64} />
        <div className="ph-mid">
          <div className="ph-title">{printTitle || title}</div>
          <div className="ph-project">{p.name}</div>
        </div>
        <div className="ph-right">
          <div>Imprimé le {new Date().toLocaleDateString('fr-FR')}</div>
          {p.docVersion && <div>Version du document : {p.docVersion}</div>}
        </div>
      </header>

      <div className="page-body">{children}</div>

      <footer className="print-end print-only">
        <span>PARKX – Suivi de projet – Maquette de parking</span>
        <strong>{SIGNATURE}</strong>
      </footer>
    </div>
  );
}

export function Card({ title, icon, actions, children, className = '', pad = true }: { title?: React.ReactNode; icon?: IconName; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={'card ' + className}>
      {(title || actions) && (
        <div className="card-head">
          <h2>
            {icon && <Icon name={icon} size={15} />}
            {title}
          </h2>
          {actions && <div className="card-actions no-print">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}
