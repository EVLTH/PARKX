import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import type { Pcb, PcbFab, PcbResult, PcbWiring } from '../db/types';
import { Badge, Btn, Field, FormSection, InfoList, Modal, PCB_FAB, PCB_RESULT, PCB_WIRING, Tabs, useUI } from '../components/ui';
import { PhotoPicker, Thumbs } from '../components/PhotoPicker';
import { fmtDate, normalize, pcbLabel } from '../lib/utils';
import { computeGeometry, pcbPlaces } from '../lib/geometry';
import { ParkingPlan } from '../components/ParkingPlan';
import { Icon } from '../components/Icons';

type StateTab = 'all' | 'nc' | 'encours' | 'probleme' | 'fini';
const TAB_STATES: Record<StateTab, PcbFab[]> = {
  all: ['nc', 'encours', 'attente', 'probleme', 'termine', 'valide'],
  nc: ['nc'],
  encours: ['encours', 'attente'],
  probleme: ['probleme'],
  fini: ['termine', 'valide'],
};

export default function PcbPage({ param }: { param?: string }) {
  const { data, save } = useStore();
  const { toast } = useUI();
  const [viewId, setViewId] = useState('');
  const [edit, setEdit] = useState<Pcb | null>(null);
  const [formTab, setFormTab] = useState<'fab' | 'tests' | 'notes'>('fab');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<StateTab>('all');
  const geo = useMemo(() => computeGeometry(data.kv.planConfig), [data.kv.planConfig]);

  useEffect(() => {
    const p = param && data.pcbs.find((x) => x.id === param);
    if (p) setViewId(p.id);
  }, [param]);

  const matches = (p: Pcb) => !q || normalize([pcbLabel(p.number), p.reference, p.func, p.problems, p.comments].join(' ')).includes(normalize(q));
  const count = (t: StateTab) => data.pcbs.filter((p) => TAB_STATES[t].includes(p.fabState) && matches(p)).length;
  const list = data.pcbs.filter((p) => TAB_STATES[tab].includes(p.fabState) && matches(p));
  const ok = data.pcbs.filter((p) => p.fabState === 'valide').length;
  const view = viewId ? data.pcbs.find((p) => p.id === viewId) : undefined;
  const startEdit = (p: Pcb) => {
    setFormTab('fab');
    setEdit({ ...p });
  };

  return (
    <PageShell title="Électricité et PCB" icon="cpu" orientation="landscape">
      <div className="toolbar no-print">
        <div className="search-in">
          <Icon name="search" size={14} />
          <input placeholder="Rechercher un PCB…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="toolbar-note"><b>{ok}</b> / 12 validés</span>
      </div>
      <Tabs
        className="inline list-tabs"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'all', label: 'Tous', count: count('all') },
          { id: 'nc', label: 'Non commencés', count: count('nc') },
          { id: 'encours', label: 'En cours', count: count('encours') },
          { id: 'probleme', label: 'Problèmes', count: count('probleme') },
          { id: 'fini', label: 'Terminés', count: count('fini') },
        ]}
      />

      <div className="pcb-grid no-print">
        {list.map((p) => {
          const [a, b] = pcbPlaces(p.number);
          return (
            <button key={p.id} className={'pcb-card t-' + PCB_FAB[p.fabState].tone} onClick={() => setViewId(p.id)}>
              <div className="pcb-top">
                <span className="pcb-num">{pcbLabel(p.number)}</span>
                <Badge tone={PCB_FAB[p.fabState].tone}>{PCB_FAB[p.fabState].label}</Badge>
              </div>
              <div className="pcb-places">Places {a}{a === 1 ? ' (PMR)' : ''} et {b}</div>
              {p.reference && <div className="pcb-info"><span>{p.reference}</span></div>}
              {p.problems && <div className="pcb-pb"><Icon name="alert" size={12} /> {p.problems}</div>}
            </button>
          );
        })}
        {!list.length && <p className="muted">Aucun PCB dans cette catégorie.</p>}
      </div>

      <div className="print-only">
        <table className="table print-table">
          <thead>
            <tr><th>PCB</th><th>Places</th><th>Référence</th><th>Fonction</th><th>Fabrication</th><th>Branchement</th><th>Alimentation</th><th>Connexions</th><th>Tests</th><th>Dernier test</th><th>Résultat</th><th>Problèmes / commentaires</th></tr>
          </thead>
          <tbody>
            {data.pcbs.map((p) => (
              <tr key={p.id}>
                <td><b>{pcbLabel(p.number)}</b></td>
                <td>{pcbPlaces(p.number).join(' et ')}</td>
                <td>{p.reference || '—'}</td>
                <td>{p.func || '—'}</td>
                <td>{PCB_FAB[p.fabState].label}</td>
                <td>{PCB_WIRING[p.wiringState].label}</td>
                <td>{p.power || '—'}</td>
                <td>{p.connections || '—'}</td>
                <td>{p.tests || '—'}</td>
                <td>{fmtDate(p.lastTestDate)}</td>
                <td>{PCB_RESULT[p.result].label}</td>
                <td>{[p.problems, p.comments].filter(Boolean).join(' — ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view && !edit && (
        <Modal
          wide
          icon="cpu"
          title={`${pcbLabel(view.number)} — places ${pcbPlaces(view.number).join(' et ')}`}
          onClose={() => setViewId('')}
          footer={
            <>
              <Btn onClick={() => setViewId('')}>Fermer</Btn>
              <Btn kind="primary" icon="edit" onClick={() => startEdit(view)}>Modifier</Btn>
            </>
          }
        >
          <div className="detail-badges">
            <Badge tone={PCB_FAB[view.fabState].tone}>{PCB_FAB[view.fabState].label}</Badge>
            <Badge tone={PCB_WIRING[view.wiringState].tone}>{PCB_WIRING[view.wiringState].label}</Badge>
            <Badge tone={PCB_RESULT[view.result].tone}>{PCB_RESULT[view.result].label}</Badge>
          </div>
          <div className="pcb-detail">
            <div className="pcb-locate">
              <ParkingPlan geo={geo} options={{ dims: false, pcbs: true, margins: false, numbers: true, marks: false }} highlightPcb={view.number} />
            </div>
            <InfoList
              rows={[
                ['Référence du composant', view.reference],
                ['Fonction', view.func],
                ['Alimentation', view.power],
                ['Connexions', view.connections],
                ['Tests effectués', view.tests],
                ['Date du dernier test', view.lastTestDate ? fmtDate(view.lastTestDate) : ''],
                ['Problèmes rencontrés', view.problems],
                ['Commentaires', view.comments],
              ]}
              empty="Fiche encore vide : cliquez sur « Modifier » pour la remplir."
            />
          </div>
          {view.photoIds.length > 0 && (
            <div className="m">
              <Thumbs ids={view.photoIds} size={72} />
            </div>
          )}
        </Modal>
      )}

      {edit && (
        <Modal
          wide
          icon="edit"
          title={`Modifier ${pcbLabel(edit.number)} — places ${pcbPlaces(edit.number).join(' et ')}`}
          onClose={() => setEdit(null)}
          footer={
            <>
              <Btn onClick={() => setEdit(null)}>Annuler</Btn>
              <Btn kind="primary" icon="save" onClick={async () => { await save('pcbs', edit); toast(`${pcbLabel(edit.number)} enregistré.`); setEdit(null); }}>Enregistrer</Btn>
            </>
          }
        >
          <Tabs
            value={formTab}
            onChange={setFormTab}
            items={[
              { id: 'fab', label: 'Fabrication', icon: 'cpu' },
              { id: 'tests', label: 'Tests', icon: 'check' },
              { id: 'notes', label: 'Notes et photos', icon: 'edit', count: (edit.problems ? 1 : 0) + (edit.comments ? 1 : 0) + edit.photoIds.length || undefined },
            ]}
          />
          {formTab === 'fab' && (
            <FormSection title="Fabrication et branchement">
              <Field label="Référence du composant"><input value={edit.reference} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></Field>
              <Field label="Fonction"><input value={edit.func} onChange={(e) => setEdit({ ...edit, func: e.target.value })} /></Field>
              <Field label="État de fabrication">
                <select value={edit.fabState} onChange={(e) => setEdit({ ...edit, fabState: e.target.value as PcbFab })}>
                  {(Object.keys(PCB_FAB) as PcbFab[]).map((k) => <option key={k} value={k}>{PCB_FAB[k].label}</option>)}
                </select>
              </Field>
              <Field label="État du branchement">
                <select value={edit.wiringState} onChange={(e) => setEdit({ ...edit, wiringState: e.target.value as PcbWiring })}>
                  {(Object.keys(PCB_WIRING) as PcbWiring[]).map((k) => <option key={k} value={k}>{PCB_WIRING[k].label}</option>)}
                </select>
              </Field>
              <Field label="Alimentation"><input value={edit.power} onChange={(e) => setEdit({ ...edit, power: e.target.value })} /></Field>
              <Field label="Connexions"><input value={edit.connections} onChange={(e) => setEdit({ ...edit, connections: e.target.value })} /></Field>
            </FormSection>
          )}
          {formTab === 'tests' && (
            <FormSection title="Tests">
              <Field label="Tests effectués" full><textarea rows={3} value={edit.tests} onChange={(e) => setEdit({ ...edit, tests: e.target.value })} /></Field>
              <Field label="Date du dernier test"><input type="date" value={edit.lastTestDate} onChange={(e) => setEdit({ ...edit, lastTestDate: e.target.value })} /></Field>
              <Field label="Résultat">
                <select value={edit.result} onChange={(e) => setEdit({ ...edit, result: e.target.value as PcbResult })}>
                  {(Object.keys(PCB_RESULT) as PcbResult[]).map((k) => <option key={k} value={k}>{PCB_RESULT[k].label}</option>)}
                </select>
              </Field>
            </FormSection>
          )}
          {formTab === 'notes' && (
            <FormSection title="Notes et photos">
              <Field label="Problèmes rencontrés" full><textarea rows={3} value={edit.problems} onChange={(e) => setEdit({ ...edit, problems: e.target.value })} /></Field>
              <Field label="Commentaires" full><textarea rows={3} value={edit.comments} onChange={(e) => setEdit({ ...edit, comments: e.target.value })} /></Field>
              <Field label="Photos" full><PhotoPicker value={edit.photoIds} onChange={(ids) => setEdit({ ...edit, photoIds: ids })} meta={{ category: 'PCB', description: pcbLabel(edit.number) }} /></Field>
            </FormSection>
          )}
        </Modal>
      )}
    </PageShell>
  );
}
