// Fiche descriptive de la maquette — version épurée.
import { useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import { REFERENCE_PLAN, type Project } from '../db/types';
import { Badge, Btn, Field, FormSection, Modal, TabbedCard, useUI } from '../components/ui';
import { computeGeometry, diffConfig } from '../lib/geometry';
import { ParkingPlan } from '../components/ParkingPlan';
import { fmtDate } from '../lib/utils';
import type { Route } from '../components/Layout';

const f = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR');

export default function Presentation({ go }: { go: (r: Route) => void }) {
  const { data, setKV } = useStore();
  const { toast } = useUI();
  const p = data.kv.project;
  const cfg = data.kv.planConfig;
  const geo = computeGeometry(cfg);
  const [edit, setEdit] = useState<Project | null>(null);
  const [err, setErr] = useState('');
  const diffs = diffConfig(REFERENCE_PLAN, cfg);

  const rows: [string, string][] = [
    ['Plaque', `${f(cfg.plateW)} × ${f(cfg.plateH)} cm`],
    ['Bordures', `${f(cfg.border)} cm`],
    ['Surface intérieure', `${f(geo.innerW)} × ${f(geo.innerH)} cm`],
    ['Allée centrale', `${f(cfg.aisle)} cm`],
    ['Place classique', `${f(cfg.placeDepth)} × ${f(cfg.placeWidth)} cm`],
    ['Place PMR', `${f(cfg.placeDepth)} × ${f(cfg.pmrWidth)} cm`],
  ];

  return (
    <PageShell title="Présentation du projet" icon="info">
      <div className="grid g-2 pres-grid">
        <Card title="Projet" icon="info" actions={<Btn small icon="edit" onClick={() => { setEdit({ ...p }); setErr(''); }}>Modifier</Btn>}>
          <h3 className="pres-name">{p.name}</h3>
          <dl className="dl">
            <dt>Statut</dt><dd><Badge tone="blue">{p.statusLabel || '—'}</Badge></dd>
            <dt>Dates</dt><dd>{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</dd>
            <dt>Équipe</dt><dd>{data.kv.settings.contributors.join(', ') || '—'}</dd>
          </dl>
          {p.description && <p className="desc">{p.description}</p>}
        </Card>

        <TabbedCard
          className="maquette-card"
          tabs={[
            {
              id: 'bref',
              label: 'La maquette',
              icon: 'ruler',
              content: (
                <>
                  <div className="facts">
                    <div><b>24</b><span>places</span></div>
                    <div><b>1</b><span>place PMR</span></div>
                    <div><b>12</b><span>PCB</span></div>
                    <div><b>24</b><span>LED</span></div>
                  </div>
                  <ul className="bullets">
                    <li>En haut : 12 places (n° 13 à 24). En bas : la place PMR n°1 tout à gauche, puis les places 2 à 12.</li>
                    <li>Un PCB pour deux places, une LED à l'entrée de chaque place.</li>
                  </ul>
                </>
              ),
            },
            {
              id: 'dims',
              label: 'Dimensions',
              icon: 'layers',
              action: <a className="link" onClick={() => go('conception')}>Modifier les mesures</a>,
              content: (
                <>
                  <table className="table compact dims">
                    <tbody>
                      {rows.map(([a, b]) => (
                        <tr key={a}><td>{a}</td><td className="num"><b>{b}</b></td></tr>
                      ))}
                    </tbody>
                  </table>
                  {diffs.length > 0 && <div className="notice warn slim m">Mesures modifiées par rapport au cahier des charges.</div>}
                </>
              ),
            },
            {
              id: 'plan',
              label: 'Plan',
              icon: 'plan',
              action: <a className="link" onClick={() => go('conception')}>Ouvrir le plan</a>,
              content: (
                <div className="plan-preview">
                  <ParkingPlan geo={geo} options={{ dims: true, pcbs: false, margins: false, numbers: true, marks: false }} />
                </div>
              ),
            },
          ]}
        />
      </div>

      {edit && (
        <Modal
          title="Modifier les informations du projet"
          icon="edit"
          onClose={() => setEdit(null)}
          footer={
            <>
              <Btn onClick={() => setEdit(null)}>Annuler</Btn>
              <Btn
                kind="primary"
                icon="save"
                onClick={async () => {
                  if (!edit.name.trim()) return setErr('Le nom du projet est obligatoire.');
                  if (edit.startDate && edit.endDate && edit.endDate < edit.startDate) return setErr('La date de fin doit être postérieure à la date de début.');
                  await setKV('project', edit, 'Informations du projet');
                  toast('Informations du projet enregistrées.');
                  setEdit(null);
                }}
              >
                Enregistrer
              </Btn>
            </>
          }
        >
          <FormSection title="Identification">
            <Field label="Nom du projet *" full error={err && !edit.name.trim() ? err : ''}><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Sous-titre" full><input value={edit.subtitle} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></Field>
            <Field label="Statut général"><input value={edit.statusLabel} onChange={(e) => setEdit({ ...edit, statusLabel: e.target.value })} /></Field>
            <Field label="Version du document"><input value={edit.docVersion} onChange={(e) => setEdit({ ...edit, docVersion: e.target.value })} /></Field>
          </FormSection>
          <FormSection title="Planning">
            <Field label="Date de début"><input type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
            <Field label="Date prévisionnelle de fin" error={err.includes('fin') ? err : ''}><input type="date" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} /></Field>
          </FormSection>
          <FormSection title="Description">
            <Field label="Description" full><textarea rows={4} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </FormSection>
        </Modal>
      )}
    </PageShell>
  );
}
