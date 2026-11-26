// Tableau de bord épuré : l'avancement en un coup d'œil, le reste dans une carte à onglets.
import { PageShell } from '../components/PageShell';
import { blobUrl, useStore } from '../db/store';
import { Badge, Btn, DemoTag, Empty, PCB_FAB, PRIORITY, Progress, TabbedCard, TASK_STATUS, useUI } from '../components/ui';
import { Icon, type IconName } from '../components/Icons';
import { isDone, taskStats } from '../lib/stats';
import { fmtDate, fmtDateTime } from '../lib/utils';
import type { Route } from '../components/Layout';

function Kpi({ icon, label, value, sub, tone = 'blue', onClick }: { icon: IconName; label: string; value: string; sub?: string; tone?: string; onClick?: () => void }) {
  return (
    <button className={'kpi kpi-' + tone} onClick={onClick}>
      <span className="kpi-ic"><Icon name={icon} size={17} /></span>
      <span className="kpi-txt">
        <span className="kpi-label">{label}</span>
        <span className="kpi-val">{value}</span>
        {sub && <span className="kpi-sub">{sub}</span>}
      </span>
    </button>
  );
}

export default function Dashboard({ go }: { go: (r: Route, id?: string) => void }) {
  const { data, removeDemo } = useStore();
  const { confirm, toast } = useUI();
  const p = data.kv.project;
  const s = taskStats(data.tasks);
  const pcbOk = data.pcbs.filter((x) => x.fabState === 'valide').length;
  const pcbPb = data.pcbs.filter((x) => x.fabState === 'probleme' || x.result === 'ko').length;
  const today = new Date().toISOString().slice(0, 10);
  const open = data.tasks
    .filter((t) => !isDone(t))
    .sort((a, b) => (a.status === 'blocked' ? -1 : 0) - (b.status === 'blocked' ? -1 : 0) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const upcoming = open.slice(0, 5);
  const photos = [...data.photos].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 6);
  const demoN = data.tasks.filter((t) => t.demo).length + data.journal.filter((j) => j.demo).length;
  const pcbCount = (st: string[]) => data.pcbs.filter((x) => st.includes(x.fabState)).length;

  const dropDemo = async () => {
    if (!(await confirm({ title: 'Supprimer les exemples de démonstration ?', text: `${demoN} exemple(s) marqué(s) « DÉMO » seront supprimés. Vos propres données ne sont pas touchées.`, danger: true, confirm: 'Supprimer les exemples' }))) return;
    const n = await removeDemo();
    toast(`${n} exemple(s) supprimé(s).`);
  };

  return (
    <PageShell title="Tableau de bord" icon="dashboard" orientation="portrait">
      <div className="hero">
        <div className="hero-main">
          <h2>{p.name}</h2>
          <div className="hero-meta">
            <Badge tone="blue">{p.statusLabel || 'Statut non défini'}</Badge>
            <span><Icon name="calendar" size={13} /> {fmtDate(p.startDate)} → {fmtDate(p.endDate)}</span>
          </div>
        </div>
        <div className="hero-progress">
          <div className="hp-top">
            <span>Avancement</span>
            <b>{Math.round(s.pct)} %</b>
          </div>
          <Progress value={s.pct} />
          <small>{s.done} / {s.total} tâches terminées</small>
        </div>
      </div>

      <div className="quick-actions">
        <Btn kind="primary" icon="plus" onClick={() => go('fabrication', 'nouveau')}>Ajouter une tâche</Btn>
        <Btn icon="camera" onClick={() => go('galerie', 'ajouter')}>Ajouter une photo</Btn>
        <Btn icon="book" onClick={() => go('journal', 'nouveau')}>Écrire dans le journal</Btn>
      </div>

      {demoN > 0 && (
        <div className="notice slim no-print">
          <Icon name="info" size={14} />
          <span>Des exemples <DemoTag /> sont affichés. <a onClick={dropDemo}>Les supprimer</a></span>
        </div>
      )}

      <div className="kpis">
        <Kpi icon="check" label="Terminées" value={String(s.done)} sub={`sur ${s.total} tâches`} tone="green" onClick={() => go('fabrication')} />
        <Kpi icon="clock" label="En cours" value={String(s.doing)} tone="blue" onClick={() => go('fabrication')} />
        <Kpi icon="alert" label="Bloquées" value={String(s.blocked)} sub={s.late ? `${s.late} en retard` : undefined} tone={s.blocked || s.late ? 'red' : 'gray'} onClick={() => go('fabrication')} />
        <Kpi icon="cpu" label="PCB validés" value={`${pcbOk} / 12`} sub={pcbPb ? `${pcbPb} en problème` : undefined} tone={pcbPb ? 'orange' : 'green'} onClick={() => go('pcb')} />
      </div>

      <TabbedCard
        className="dash-tabs"
        tabs={[
          {
            id: 'etapes',
            label: 'Prochaines étapes',
            icon: 'tasks',
            count: open.length,
            action: <a className="link" onClick={() => go('fabrication')}>Toutes les tâches</a>,
            content: upcoming.length ? (
              <ul className="list">
                {upcoming.map((t) => (
                  <li key={t.id} onClick={() => go('fabrication', t.id)}>
                    <span className={'dot t-' + TASK_STATUS[t.status].tone} title={TASK_STATUS[t.status].label} />
                    <span className="li-main">{t.name} {t.demo && <DemoTag />}</span>
                    {t.status === 'blocked' ? <Badge tone="red">Bloqué</Badge> : (t.priority === 'critique' || t.priority === 'haute') && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
                    <span className={'li-date ' + (t.dueDate && t.dueDate < today ? 'late' : '')}>{fmtDate(t.dueDate)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Aucune étape à venir" icon="check" />
            ),
          },
          {
            id: 'recent',
            label: 'Dernières modifications',
            icon: 'history',
            content: data.activity.length ? (
              <ul className="activity">
                {data.activity.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <span className={'act-ic act-' + a.action.slice(0, 4)} />
                    <div>
                      <div>{a.label}</div>
                      <small>{a.author} · {fmtDateTime(a.at)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Aucune modification" icon="history" />
            ),
          },
          {
            id: 'pcb',
            label: 'PCB',
            icon: 'cpu',
            action: <a className="link" onClick={() => go('pcb')}>Fiches PCB</a>,
            content: (
              <div className="pcb-overview">
                <div className="pcb-strip">
                  {data.pcbs.map((x) => (
                    <span key={x.id} className={'pcb-chip t-' + PCB_FAB[x.fabState].tone} title={`PCB ${String(x.number).padStart(2, '0')} – ${PCB_FAB[x.fabState].label}`} onClick={() => go('pcb', x.id)}>
                      {String(x.number).padStart(2, '0')}
                    </span>
                  ))}
                </div>
                <p className="muted small">{pcbOk} validé(s) · {pcbCount(['encours', 'attente'])} en cours · {pcbCount(['probleme'])} en problème · {pcbCount(['nc'])} non commencé(s)</p>
              </div>
            ),
          },
          ...(photos.length
            ? [
                {
                  id: 'photos',
                  label: 'Photos',
                  icon: 'image' as IconName,
                  count: data.photos.length,
                  action: <a className="link" onClick={() => go('galerie')}>Toutes les photos</a>,
                  content: (
                    <div className="photo-mini">
                      {photos.map((ph) => (
                        <figure key={ph.id} onClick={() => go('galerie', ph.id)}>
                          <img src={blobUrl(ph.blob)} alt={ph.description || ph.name} />
                          <figcaption>{fmtDate(ph.date)}</figcaption>
                        </figure>
                      ))}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </PageShell>
  );
}
