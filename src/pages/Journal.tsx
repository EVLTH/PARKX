import { useEffect, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import type { JournalEntry } from '../db/types';
import { ActionMenu, Badge, Btn, DemoTag, Empty, Field, FormSection, Modal, usePrinting, useShowMore, useUI, type Tone } from '../components/ui';
import { PhotoPicker, Thumbs } from '../components/PhotoPicker';
import { downloadBlob, fmtDate, normalize, todayISO } from '../lib/utils';
import { Icon } from '../components/Icons';

export const JOURNAL_CATS: Record<string, Tone> = {
  Décision: 'navy',
  Modification: 'blue',
  Problème: 'red',
  Solution: 'green',
  Essai: 'orange',
  Résultat: 'green',
  Observation: 'gray',
  'Compte rendu': 'blue',
};

export default function Journal({ param }: { param?: string }) {
  const { data, save, remove, user } = useStore();
  const { toast, confirm } = useUI();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [period, setPeriod] = useState(false);
  const [edit, setEdit] = useState<Partial<JournalEntry> | null>(null);
  const [viewId, setViewId] = useState('');
  const [err, setErr] = useState('');
  const printing = usePrinting();
  const blank = (): Partial<JournalEntry> => ({ date: todayISO(), title: '', description: '', author: user, category: 'Observation', photoIds: [], docIds: [] });

  useEffect(() => {
    if (param === 'nouveau') {
      setErr('');
      setEdit(blank());
      return;
    }
    const j = param && data.journal.find((x) => x.id === param);
    if (j) setViewId(j.id);
  }, [param]);

  const list = [...data.journal]
    .filter((j) => (!cat || j.category === cat) && (!from || j.date >= from) && (!to || j.date <= to) && (!q || normalize(j.title + ' ' + j.description + ' ' + j.author).includes(normalize(q))))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const more = useShowMore(list, 10);
  const view = viewId ? data.journal.find((j) => j.id === viewId) : undefined;

  // Regroupement par mois (entrées affichées)
  const groups: { key: string; items: JournalEntry[] }[] = [];
  (printing ? list : more.visible).forEach((j) => {
    const k = new Date(j.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const g = groups.find((x) => x.key === k);
    if (g) g.items.push(j);
    else groups.push({ key: k, items: [j] });
  });

  const del = async (j: JournalEntry) => {
    if (await confirm({ title: 'Supprimer cette entrée ?', text: <>« {j.title} » sera supprimée du journal.</>, confirm: 'Supprimer', danger: true })) {
      await remove('journal', j.id);
      toast('Entrée supprimée.');
      setEdit(null);
      setViewId('');
    }
  };

  return (
    <PageShell
      title="Journal de projet"
      icon="book"
      actions={<Btn kind="primary" icon="plus" onClick={() => { setErr(''); setEdit(blank()); }}>Nouvelle entrée</Btn>}
    >
      <div className="toolbar no-print">
        <div className="search-in"><Icon name="search" size={14} /><input placeholder="Rechercher dans le journal…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {Object.keys(JOURNAL_CATS).map((c) => <option key={c}>{c}</option>)}
        </select>
        <Btn small kind={period || from || to ? 'secondary' : 'ghost'} icon="calendar" onClick={() => setPeriod(!period)} aria-expanded={period}>Période</Btn>
        {(period || from || to) && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" title="Du" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au" title="Au" />
          </>
        )}
        {(q || cat || from || to) && <Btn small kind="ghost" icon="x" onClick={() => { setQ(''); setCat(''); setFrom(''); setTo(''); }}>Effacer</Btn>}
      </div>

      {list.length === 0 ? (
        <Empty icon="book" title="Aucune entrée" text="Consignez les décisions et événements du projet au fil de l'eau." />
      ) : (
        <div className="journal">
          {groups.map((g) => (
            <div key={g.key} className="j-group">
              <h3 className="j-month">{g.key}</h3>
              {g.items.map((j) => (
                <article key={j.id} className="j-entry avoid-break" onClick={() => setViewId(j.id)}>
                  <div className="j-date">
                    <b>{new Date(j.date + 'T12:00').getDate()}</b>
                    <span>{new Date(j.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'short' })}</span>
                  </div>
                  <div className={'j-dot t-' + (JOURNAL_CATS[j.category] || 'gray')} />
                  <div className="j-body">
                    <div className="j-head">
                      <Badge tone={JOURNAL_CATS[j.category] || 'gray'}>{j.category}</Badge>
                      <h4>{j.title} {j.demo && <DemoTag />}</h4>
                      <span className="no-print row-btns" onClick={(e) => e.stopPropagation()}>
                        <Btn small kind="ghost" icon="edit" aria-label="Modifier" title="Modifier" onClick={() => { setErr(''); setEdit({ ...j }); }} />
                        <ActionMenu items={[{ label: 'Voir les détails', icon: 'eye', onClick: () => setViewId(j.id) }, { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => del(j) }]} />
                      </span>
                    </div>
                    {j.description && <p className="j-text clamp">{j.description}</p>}
                    <small className="muted">{fmtDate(j.date)} · {j.author}</small>
                    {j.photoIds.length > 0 && <div className="print-only"><Thumbs ids={j.photoIds} size={56} /></div>}
                    {j.docIds.length > 0 && <small className="print-only">Documents : {j.docIds.map((id) => data.documents.find((d) => d.id === id)?.name).filter(Boolean).join(', ')}</small>}
                    {(j.photoIds.length > 0 || j.docIds.length > 0) && (
                      <small className="muted j-att no-print">
                        {j.photoIds.length > 0 && <><Icon name="image" size={12} /> {j.photoIds.length} photo(s) </>}
                        {j.docIds.length > 0 && <><Icon name="file" size={12} /> {j.docIds.length} document(s)</>}
                      </small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ))}
          {more.control}
        </div>
      )}

      {view && !edit && (
        <Modal
          wide
          title={view.title}
          icon="book"
          onClose={() => setViewId('')}
          footer={
            <>
              <Btn kind="danger" icon="trash" className="mr-auto" onClick={() => del(view)}>Supprimer</Btn>
              <Btn onClick={() => setViewId('')}>Fermer</Btn>
              <Btn kind="primary" icon="edit" onClick={() => { setErr(''); setEdit({ ...view }); }}>Modifier</Btn>
            </>
          }
        >
          <div className="detail-badges">
            <Badge tone={JOURNAL_CATS[view.category] || 'gray'}>{view.category}</Badge>
            <span className="muted small">{fmtDate(view.date)} · {view.author}</span>
            {view.demo && <DemoTag />}
          </div>
          {view.description ? <p className="j-full">{view.description}</p> : <p className="muted small">Pas de description.</p>}
          {view.photoIds.length > 0 && <div className="m"><Thumbs ids={view.photoIds} size={84} /></div>}
          {view.docIds.length > 0 && (
            <div className="j-docs m">
              {view.docIds.map((id) => data.documents.find((d) => d.id === id)).filter(Boolean).map((d) => (
                <button key={d!.id} onClick={() => downloadBlob(d!.blob, d!.name)} className="doc-chip"><Icon name="file" size={12} /> {d!.name}</button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {edit && (
        <Modal
          wide
          title={edit.id ? "Modifier l'entrée" : 'Nouvelle entrée du journal'}
          icon="book"
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && <Btn kind="danger" icon="trash" className="mr-auto" onClick={() => del(edit as JournalEntry)}>Supprimer</Btn>}
              <Btn onClick={() => setEdit(null)}>Annuler</Btn>
              <Btn
                kind="primary"
                icon="save"
                onClick={async () => {
                  if (!edit.title?.trim()) return setErr('Le titre est obligatoire.');
                  if (!edit.date) return setErr('La date est obligatoire.');
                  await save('journal', { ...edit, title: edit.title.trim(), demo: false });
                  toast(edit.id ? 'Entrée modifiée.' : 'Entrée ajoutée au journal.');
                  setEdit(null);
                }}
              >
                Enregistrer
              </Btn>
            </>
          }
        >
          <FormSection title="Entrée">
            <Field label="Date *"><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Catégorie">
              <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{Object.keys(JOURNAL_CATS).map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Titre *" full error={err}><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus /></Field>
            <Field label="Description" full><textarea rows={5} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Auteur"><input value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} /></Field>
          </FormSection>
          <details className="more m" open={!!(edit.photoIds?.length || edit.docIds?.length)}>
            <summary>Photos et documents joints{(edit.photoIds?.length || 0) + (edit.docIds?.length || 0) ? ` (${(edit.photoIds?.length || 0) + (edit.docIds?.length || 0)})` : ''}</summary>
            <Field label="Photos" full><PhotoPicker value={edit.photoIds || []} onChange={(ids) => setEdit({ ...edit, photoIds: ids })} meta={{ description: edit.title }} /></Field>
            <Field label="Documents associés" full>
              <div className="doc-pick">
                {data.documents.length === 0 && <span className="muted small">Aucun document dans « Documents techniques ».</span>}
                {data.documents.map((d) => {
                  const on = edit.docIds?.includes(d.id);
                  return (
                    <label key={d.id} className={'doc-chip ' + (on ? 'on' : '')}>
                      <input type="checkbox" checked={!!on} onChange={() => setEdit({ ...edit, docIds: on ? edit.docIds!.filter((x) => x !== d.id) : [...(edit.docIds || []), d.id] })} />
                      <Icon name="file" size={12} /> {d.name}
                    </label>
                  );
                })}
              </div>
            </Field>
          </details>
        </Modal>
      )}
    </PageShell>
  );
}
