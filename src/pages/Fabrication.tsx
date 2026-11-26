import { useEffect, useMemo, useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import type { Priority, Task, TaskStatus } from '../db/types';
import { ActionMenu, Badge, Btn, DemoTag, Empty, Field, FormSection, InfoList, Modal, PRIORITY, Progress, STATUS_ORDER, Tabs, TASK_STATUS, usePrinting, useShowMore, useSort, useUI } from '../components/ui';
import { PhotoPicker, Thumbs } from '../components/PhotoPicker';
import { Timeline, TONE_COLOR } from '../components/Charts';
import { fmtDate, fmtDateTime, normalize, todayISO } from '../lib/utils';
import { isDone, taskStats } from '../lib/stats';
import { Icon } from '../components/Icons';

export const TASK_CATEGORIES = ['Structure', 'Marquage', 'Électronique', 'Câblage', 'Finitions', 'Validation', 'Divers'];
const PRIO_RANK: Record<Priority, number> = { critique: 0, haute: 1, normale: 2, basse: 3 };
type View = 'list' | 'kanban' | 'planning';
type ListTab = 'open' | 'done' | 'all';
const KB_MAX = 8;

const blank = (order: number, user: string): Partial<Task> => ({
  name: '',
  description: '',
  category: 'Structure',
  startDate: todayISO(),
  dueDate: '',
  doneDate: '',
  responsible: user,
  status: 'todo',
  priority: 'normale',
  comments: '',
  photoIds: [],
  order,
});

export default function Fabrication({ param }: { param?: string }) {
  const { data, save, remove, user } = useStore();
  const { toast, confirm } = useUI();
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('parkx-task-view') as View) || 'list';
    } catch {
      return 'list';
    }
  });
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [fCat, setFCat] = useState('');
  const [fResp, setFResp] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState('');
  const [over, setOver] = useState<TaskStatus | ''>('');
  const [listTab, setListTab] = useState<ListTab>('open');
  const [detailId, setDetailId] = useState('');
  const [kbOpen, setKbOpen] = useState<Record<string, boolean>>({});
  const printing = usePrinting();

  useEffect(() => {
    try {
      localStorage.setItem('parkx-task-view', view);
    } catch {
      /* préférence non conservée */
    }
  }, [view]);
  useEffect(() => {
    if (param === 'nouveau') {
      setErrors({});
      setEdit(blank(data.tasks.length, user));
      return;
    }
    const t = param && data.tasks.find((x) => x.id === param);
    if (t) setDetailId(t.id);
  }, [param]);

  const cats = Array.from(new Set([...TASK_CATEGORIES, ...data.tasks.map((t) => t.category).filter(Boolean)]));
  const people = Array.from(new Set([...data.kv.settings.contributors, ...data.tasks.map((t) => t.responsible).filter(Boolean)]));
  const filtered = useMemo(() => {
    const n = normalize(q);
    return data.tasks.filter(
      (t) =>
        (!n || normalize(t.name + ' ' + t.description + ' ' + t.comments + ' ' + t.category).includes(n)) &&
        (!fStatus || t.status === fStatus) &&
        (!fCat || t.category === fCat) &&
        (!fResp || t.responsible === fResp) &&
        (!fFrom || (t.dueDate || t.startDate) >= fFrom) &&
        (!fTo || (t.startDate || t.dueDate) <= fTo)
    );
  }, [data.tasks, q, fStatus, fCat, fResp, fFrom, fTo]);
  const { sorted, th } = useSort(filtered, { key: 'order', dir: 1 }, { status: (t) => STATUS_ORDER.indexOf(t.status), priority: (t) => PRIO_RANK[t.priority] });
  const nOpen = sorted.filter((t) => !isDone(t)).length;
  const tabRows = sorted.filter((t) => listTab === 'all' || (listTab === 'done' ? isDone(t) : !isDone(t)));
  const more = useShowMore(tabRows, 15);
  const listRows = printing ? sorted : more.visible;
  const detail = detailId ? data.tasks.find((t) => t.id === detailId) : undefined;
  const s = taskStats(data.tasks);
  const today = todayISO();
  const nFilters = [fStatus, fCat, fResp, fFrom, fTo].filter(Boolean).length;
  const clearFilters = () => {
    setFStatus('');
    setFCat('');
    setFResp('');
    setFFrom('');
    setFTo('');
  };

  const submit = async () => {
    if (!edit) return;
    const e: Record<string, string> = {};
    if (!edit.name?.trim()) e.name = 'Le nom est obligatoire.';
    if (edit.startDate && edit.dueDate && edit.dueDate < edit.startDate) e.dueDate = 'La fin prévue précède le début.';
    if ((edit.status === 'done' || edit.status === 'validated') && !edit.doneDate) edit.doneDate = todayISO();
    setErrors(e);
    if (Object.keys(e).length) return;
    await save('tasks', { ...edit, name: edit.name!.trim(), demo: edit.demo && edit.id ? false : edit.demo });
    toast(edit.id ? 'Tâche modifiée.' : 'Tâche ajoutée.');
    setEdit(null);
  };

  const setStatus = async (t: Task, status: TaskStatus) => {
    if (t.status === status) return;
    await save('tasks', { id: t.id, status, doneDate: (status === 'done' || status === 'validated') && !t.doneDate ? todayISO() : status === 'done' || status === 'validated' ? t.doneDate : '' }, { label: `${t.name} → ${TASK_STATUS[status].label}` });
    toast(`« ${t.name} » : ${TASK_STATUS[status].label}`);
  };

  const del = async (t: Task) => {
    if (await confirm({ title: 'Supprimer la tâche ?', text: <>La tâche <b>{t.name}</b> sera définitivement supprimée. Les photos associées restent dans la galerie.</>, confirm: 'Supprimer', danger: true })) {
      await remove('tasks', t.id);
      toast('Tâche supprimée.');
      setEdit(null);
      setDetailId('');
    }
  };

  const open = (t: Task) => {
    setErrors({});
    setEdit({ ...t });
  };
  const historyOf = (t?: Partial<Task> | null) => (t?.id ? data.activity.filter((a) => a.entity === 'Tâche' && (a.label === t.name || a.label.startsWith(t.name + ' →'))).slice(0, 12) : []);
  const history = historyOf(edit);
  const late = (t: Task) => !isDone(t) && !!t.dueDate && t.dueDate < today;

  return (
    <PageShell
      title="Suivi de fabrication"
      icon="tasks"
      orientation="landscape"
      actions={<Btn kind="primary" icon="plus" onClick={() => { setErrors({}); setEdit(blank(data.tasks.length, user)); }}>Ajouter une tâche</Btn>}
    >
      <div className="fab-progress">
        <span>Avancement</span>
        <Progress value={s.pct} label />
        <small>{s.done} / {s.total} terminées{s.blocked ? ` · ${s.blocked} bloquée(s)` : ''}{s.late ? ` · ${s.late} en retard` : ''}</small>
      </div>

      <div className="toolbar no-print">
        <div className="search-in">
          <Icon name="search" size={14} />
          <input placeholder="Rechercher une tâche…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Btn small kind={showFilters || nFilters ? 'secondary' : 'ghost'} icon="list" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
          Filtres{nFilters ? ` (${nFilters})` : ''}
        </Btn>
        <div className="seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><Icon name="list" size={14} /> Liste</button>
          <button className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}><Icon name="kanban" size={14} /> Kanban</button>
          <button className={view === 'planning' ? 'on' : ''} onClick={() => setView('planning')}><Icon name="calendar" size={14} /> Planning</button>
        </div>
      </div>
      {showFilters && (
        <div className="toolbar filters no-print">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Statut">
            <option value="">Tous les statuts</option>
            {STATUS_ORDER.map((k) => <option key={k} value={k}>{TASK_STATUS[k].label}</option>)}
          </select>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label="Catégorie">
            <option value="">Toutes catégories</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsable">
            <option value="">Tous responsables</option>
            {people.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="Du" aria-label="Du" />
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} title="Au" aria-label="Au" />
          {nFilters > 0 && <Btn small kind="ghost" icon="x" onClick={clearFilters}>Effacer</Btn>}
        </div>
      )}

      {data.tasks.length === 0 ? (
        <Empty icon="tasks" title="Aucune tâche" text="Créez les étapes de fabrication de la maquette." action={<Btn kind="primary" icon="plus" onClick={() => setEdit(blank(0, user))}>Ajouter une tâche</Btn>} />
      ) : (
        <>
          <div className={view === 'list' ? '' : 'print-only'}>
            <Tabs
              className="inline list-tabs"
              value={listTab}
              onChange={setListTab}
              items={[
                { id: 'open', label: 'À faire', count: nOpen },
                { id: 'done', label: 'Terminées', count: sorted.length - nOpen },
                { id: 'all', label: 'Toutes', count: sorted.length },
              ]}
            />
            <Card pad={false}>
              <div className="table-wrap">
                <table className="table hover">
                  <thead>
                    <tr>
                      {th('order', 'N°', 'num')}
                      {th('name', 'Tâche')}
                      {th('responsible', 'Responsable', 'hide-sm')}
                      {th('dueDate', 'Échéance')}
                      {th('status', 'Statut')}
                      {th('startDate', 'Début', 'print-col')}
                      {th('doneDate', 'Réalisée', 'print-col')}
                      {th('priority', 'Priorité', 'print-col')}
                      <th className="no-print col-act" />
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((t) => (
                      <tr key={t.id} onClick={() => setDetailId(t.id)}>
                        <td className="num">{sorted.indexOf(t) + 1}</td>
                        <td>
                          <div className="cell-title">
                            {t.name} {t.demo && <DemoTag />} {(t.priority === 'critique' || t.priority === 'haute') && <span className="no-print"><Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge></span>}
                          </div>
                          <div className="cell-sub">{t.category}</div>
                          {t.description && <div className="cell-sub print-only">{t.description}</div>}
                          {t.comments && <div className="cell-sub print-only">💬 {t.comments}</div>}
                        </td>
                        <td className="hide-sm">{t.responsible || '—'}</td>
                        <td className={late(t) ? 'late' : ''}>{fmtDate(t.dueDate)}</td>
                        <td><Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge></td>
                        <td className="print-col">{fmtDate(t.startDate)}</td>
                        <td className="print-col">{fmtDate(t.doneDate)}</td>
                        <td className="print-col">{PRIORITY[t.priority].label}</td>
                        <td className="no-print col-act" onClick={(e) => e.stopPropagation()}>
                          <span className="row-btns">
                          <Btn small kind="ghost" icon="edit" aria-label="Modifier" title="Modifier" onClick={() => open(t)} />
                          <ActionMenu
                            items={[
                              { label: 'Voir les détails', icon: 'eye', onClick: () => setDetailId(t.id) },
                              ...(!isDone(t) ? [{ label: 'Marquer terminé', icon: 'check' as const, onClick: () => setStatus(t, 'done') }] : []),
                              ...(t.status === 'done' ? [{ label: 'Valider', icon: 'shield' as const, onClick: () => setStatus(t, 'validated') }] : []),
                              { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => del(t) },
                            ]}
                          />
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!listRows.length && (
                      <tr><td colSpan={9} className="muted center">{sorted.length ? (listTab === 'open' ? 'Toutes les tâches sont terminées.' : 'Aucune tâche terminée pour le moment.') : 'Aucune tâche ne correspond à la recherche.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            {more.control}
          </div>

          {view === 'kanban' && (
            <div className="kanban no-print">
              {STATUS_ORDER.map((k) => {
                const col = sorted.filter((t) => t.status === k);
                return (
                  <div
                    key={k}
                    className={'kb-col ' + (over === k ? 'over' : '')}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== k) setOver(k); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(''); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain') || dragId;
                      const t = data.tasks.find((x) => x.id === id);
                      if (t) setStatus(t, k);
                      setOver('');
                      setDragId('');
                    }}
                  >
                    <div className="kb-head"><Badge tone={TASK_STATUS[k].tone}>{TASK_STATUS[k].label}</Badge><span>{col.length}</span></div>
                    {(kbOpen[k] ? col : col.slice(0, KB_MAX)).map((t) => (
                      <div key={t.id} className={'kb-card ' + (dragId === t.id ? 'drag' : '')} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); }} onDragEnd={() => setDragId('')} onClick={() => setDetailId(t.id)}>
                        <div className="kb-title">{t.name} {t.demo && <DemoTag />}</div>
                        <div className="kb-foot">
                          <span><Icon name="user" size={12} /> {t.responsible || '—'}</span>
                          <span className={late(t) ? 'late' : ''}>{fmtDate(t.dueDate)}</span>
                        </div>
                        {t.photoIds.length > 0 && <Thumbs ids={t.photoIds.slice(0, 3)} size={34} />}
                      </div>
                    ))}
                    {col.length > KB_MAX && (
                      <button type="button" className="kb-more" onClick={() => setKbOpen({ ...kbOpen, [k]: !kbOpen[k] })}>
                        {kbOpen[k] ? 'Réduire' : `+ ${col.length - KB_MAX} autre${col.length - KB_MAX > 1 ? 's' : ''}`}
                      </button>
                    )}
                    {!col.length && <div className="kb-empty">Déposer ici</div>}
                  </div>
                );
              })}
            </div>
          )}

          {view === 'planning' && (
            <Card className="no-print">
              <Timeline
                start={data.kv.project.startDate}
                end={data.kv.project.endDate}
                items={[...sorted].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')).map((t) => ({ id: t.id, label: t.name, start: t.startDate || t.dueDate, end: t.doneDate || t.dueDate || t.startDate, color: TONE_COLOR[TASK_STATUS[t.status].tone] }))}
              />
            </Card>
          )}
        </>
      )}

      {edit && (
        <Modal
          wide
          title={edit.id ? 'Modifier la tâche' : 'Ajouter une tâche'}
          icon={edit.id ? 'edit' : 'plus'}
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && <Btn kind="danger" icon="trash" onClick={() => del(edit as Task)} className="mr-auto">Supprimer</Btn>}
              <Btn onClick={() => setEdit(null)}>Annuler</Btn>
              <Btn kind="primary" icon="save" onClick={submit}>Enregistrer</Btn>
            </>
          }
        >
          {edit.demo && <div className="notice slim m"><DemoTag /> Tâche d'exemple : une fois enregistrée, elle ne sera plus marquée comme démonstration.</div>}
          <FormSection title="L'essentiel">
            <Field label="Nom *" full error={errors.name}><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Statut">
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as TaskStatus })}>
                {STATUS_ORDER.map((k) => <option key={k} value={k}>{TASK_STATUS[k].label}</option>)}
              </select>
            </Field>
            <Field label="Responsable">
              <input list="task-people" value={edit.responsible} onChange={(e) => setEdit({ ...edit, responsible: e.target.value })} />
              <datalist id="task-people">{people.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Date de fin prévue" error={errors.dueDate}><input type="date" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} /></Field>
            <Field label="Priorité">
              <select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as Priority })}>
                {(Object.keys(PRIORITY) as Priority[]).map((k) => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
              </select>
            </Field>
            <Field label="Catégorie">
              <input list="task-cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              <datalist id="task-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
          </FormSection>
          <div className="more-stack">
            <details className="more" open={!!(edit.description || edit.comments)}>
              <summary>Description et commentaires</summary>
              <Field label="Description" full><textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="Commentaires" full><textarea rows={3} value={edit.comments} onChange={(e) => setEdit({ ...edit, comments: e.target.value })} /></Field>
            </details>
            <details className="more">
              <summary>Autres dates (début, réalisation)</summary>
              <div className="form-grid">
                <Field label="Date de début"><input type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
                <Field label="Date de réalisation" hint="Remplie automatiquement au passage à « Terminé »"><input type="date" value={edit.doneDate} onChange={(e) => setEdit({ ...edit, doneDate: e.target.value })} /></Field>
                <Field label="Date de création"><input value={edit.createdAt ? fmtDateTime(edit.createdAt) : 'À l’enregistrement'} disabled /></Field>
              </div>
            </details>
            <details className="more" open={!!edit.photoIds?.length}>
              <summary>Photos associées{edit.photoIds?.length ? ` (${edit.photoIds.length})` : ''}</summary>
              <PhotoPicker value={edit.photoIds || []} onChange={(ids) => setEdit({ ...edit, photoIds: ids })} meta={{ category: edit.category || 'Divers', taskId: edit.id || '' }} />
            </details>
            {edit.id && (
              <details className="more">
                <summary>Historique</summary>
                <div className="history">
                  <p className="muted small">Créée le {fmtDateTime(edit.createdAt)} par {edit.createdBy} · modifiée le {fmtDateTime(edit.updatedAt)} par {edit.updatedBy}</p>
                  <ul>
                    {history.map((a) => <li key={a.id}><b>{a.action}</b> — {a.label} <small>{fmtDateTime(a.at)} · {a.author}</small></li>)}
                  </ul>
                </div>
              </details>
            )}
          </div>
        </Modal>
      )}

      {detail && !edit && (
        <Modal
          wide
          title={detail.name}
          icon="tasks"
          onClose={() => setDetailId('')}
          footer={
            <>
              <Btn kind="danger" icon="trash" onClick={() => del(detail)} className="mr-auto">Supprimer</Btn>
              {!isDone(detail) && <Btn icon="check" onClick={() => setStatus(detail, 'done')}>Marquer terminé</Btn>}
              {detail.status === 'done' && <Btn icon="shield" onClick={() => setStatus(detail, 'validated')}>Valider</Btn>}
              <Btn kind="primary" icon="edit" onClick={() => open(detail)}>Modifier</Btn>
            </>
          }
        >
          <div className="detail-badges">
            <Badge tone={TASK_STATUS[detail.status].tone}>{TASK_STATUS[detail.status].label}</Badge>
            <Badge tone={PRIORITY[detail.priority].tone}>Priorité {PRIORITY[detail.priority].label.toLowerCase()}</Badge>
            {detail.category && <span className="muted small">{detail.category}</span>}
            {detail.demo && <DemoTag />}
          </div>
          <InfoList
            rows={[
              ['Responsable', detail.responsible],
              ['Fin prévue', detail.dueDate ? <span className={late(detail) ? 'late' : ''}>{fmtDate(detail.dueDate)}{late(detail) ? ' (en retard)' : ''}</span> : ''],
              ['Début', detail.startDate ? fmtDate(detail.startDate) : ''],
              ['Réalisée le', detail.doneDate ? fmtDate(detail.doneDate) : ''],
              ['Description', detail.description],
              ['Commentaires', detail.comments],
            ]}
          />
          {detail.photoIds.length > 0 && (
            <div className="m">
              <Thumbs ids={detail.photoIds} size={72} />
            </div>
          )}
          <details className="more m">
            <summary>Historique</summary>
            <div className="history">
              <p className="muted small">Créée le {fmtDateTime(detail.createdAt)} par {detail.createdBy} · modifiée le {fmtDateTime(detail.updatedAt)} par {detail.updatedBy}</p>
              <ul>
                {historyOf(detail).map((a) => <li key={a.id}><b>{a.action}</b> — {a.label} <small>{fmtDateTime(a.at)} · {a.author}</small></li>)}
              </ul>
            </div>
          </details>
        </Modal>
      )}
    </PageShell>
  );
}
