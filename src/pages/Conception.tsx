import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import { REFERENCE_PLAN, type PlaceInfo, type PlanConfig, type PlanVersion } from '../db/types';
import { Badge, Btn, Field, InfoList, Modal, ToggleMenu, useShowMore, useUI } from '../components/ui';
import { CONFIG_FIELDS, computeGeometry, diffConfig } from '../lib/geometry';
import { DEFAULT_OPTIONS, ParkingPlan, PlanLegend, PlanViewer, type PlanOptions } from '../components/ParkingPlan';
import { PhotoPicker } from '../components/PhotoPicker';
import { blobUrl } from '../db/store';
import { fmtDateTime, pcbLabel } from '../lib/utils';
import { Icon } from '../components/Icons';

const f = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR');
const same = (a: PlanConfig, b: PlanConfig) => diffConfig(a, b).length === 0;

const emptyPlace = (n: number): Partial<PlaceInfo> => ({ id: 'place-' + n, number: n, description: '', reference: '', observations: '', modifications: '', annotations: '', photoIds: [] });

export default function Conception({ param }: { param?: string }) {
  const { data, setKV, save, log } = useStore();
  const { toast, confirm } = useUI();
  const cfg = data.kv.planConfig;
  const [draft, setDraft] = useState<Record<keyof PlanConfig, string>>(() => toDraft(cfg));
  const [tab, setTab] = useState<'mesures' | 'place' | 'versions'>('mesures');
  const [sel, setSel] = useState<number | null>(null);
  const [opts, setOpts] = useState<PlanOptions>(DEFAULT_OPTIONS);
  const [verModal, setVerModal] = useState(false);
  const [verComment, setVerComment] = useState('');
  const [preview, setPreview] = useState<PlanVersion | null>(null);
  const [placeEdit, setPlaceEdit] = useState(false);
  const logTimer = useRef<number>();
  const lastLogged = useRef<PlanConfig>(cfg);

  useEffect(() => setDraft(toDraft(cfg)), [cfg]);
  useEffect(() => {
    if (param?.startsWith('place-')) {
      setSel(Number(param.slice(6)));
      setTab('place');
    }
  }, [param]);

  const parsed = useMemo(() => {
    const out: any = {};
    for (const k of Object.keys(draft) as (keyof PlanConfig)[]) out[k] = parseFloat(String(draft[k]).replace(',', '.'));
    return out as PlanConfig;
  }, [draft]);
  const draftValid = Object.values(parsed).every((v) => Number.isFinite(v) && v > 0);
  const geo = computeGeometry(draftValid ? parsed : cfg);
  const versions = [...data.planVersions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastVersion = versions[0];
  const diffRef = diffConfig(REFERENCE_PLAN, geo.cfg);
  const diffVer = lastVersion ? diffConfig(lastVersion.config, geo.cfg) : [];
  const matchVer = versions.find((v) => same(v.config, geo.cfg));
  const verList = useShowMore(versions, 5);

  const change = (k: keyof PlanConfig, v: string) => {
    const nd = { ...draft, [k]: v };
    setDraft(nd);
    const val = parseFloat(v.replace(',', '.'));
    if (!(Number.isFinite(val) && val > 0)) return;
    const next = { ...cfg, ...parseDraft(nd) };
    if (!Object.values(next).every((x) => Number.isFinite(x) && x > 0)) return;
    setKV('planConfig', next); // enregistrement automatique immédiat
    window.clearTimeout(logTimer.current);
    logTimer.current = window.setTimeout(() => {
      const d = diffConfig(lastLogged.current, next);
      if (d.length) log('modification', 'Plan', 'Mesures : ' + d.join(' ; '));
      lastLogged.current = next;
    }, 1500);
  };

  const ensureVersioned = async (reason: string) => {
    if (!data.planVersions.some((v) => same(v.config, cfg))) {
      await save('planVersions', { label: `v${data.planVersions.length + 1} – auto`, comment: reason, config: { ...cfg } });
    }
  };

  const place = sel ? data.places.find((p) => p.number === sel) : undefined;
  const [pf, setPf] = useState<Partial<PlaceInfo>>(emptyPlace(1));
  useEffect(() => {
    if (sel) setPf(place ? { ...place } : emptyPlace(sel));
  }, [sel, place?.updatedAt]);
  useEffect(() => setPlaceEdit(false), [sel]);
  const pg = sel ? geo.places.find((p) => p.number === sel) : undefined;

  return (
    <PageShell
      title="Conception et plans"
      icon="ruler"
      subtitle="Plan technique paramétrique — vue de dessus"
      orientation="landscape"
      actions={<Btn icon="save" onClick={() => { setVerComment(''); setVerModal(true); }}>Enregistrer une version</Btn>}
    >
      {geo.errors.length > 0 && (
        <div className="notice err no-print"><Icon name="alert" size={15} /> {geo.errors.join(' ')}</div>
      )}
      {diffRef.length > 0 && (
        <div className="notice warn no-print">
          <Icon name="alert" size={15} />
          <span><b>Mesures modifiées</b> — {diffRef.join(' · ')}</span>
        </div>
      )}

      <div className="concept">
        <Card className="concept-plan" pad={false}>
          <PlanViewer
            geo={geo}
            height="min(62vh, 620px)"
            toolbarExtra={
              <div className="pv-toggles">
                <ToggleMenu
                  label="Affichage"
                  icon="layers"
                  items={([['dims', 'Cotations'], ['pcbs', 'PCB et LED'], ['margins', 'Marges'], ['numbers', 'Numéros'], ['marks', 'Repères']] as [keyof PlanOptions, string][]).map(([k, l]) => ({ label: l, checked: opts[k], onChange: (v: boolean) => setOpts({ ...opts, [k]: v }) }))}
                />
              </div>
            }
          >
            {(vb) => <ParkingPlan geo={geo} options={opts} viewBox={vb} selected={sel} highlightPcb={pg?.pcb} onSelect={(n) => { setSel(n); setTab('place'); }} />}
          </PlanViewer>
          <PlanLegend />
        </Card>

        <div className="concept-side no-print">
          <div className="tabs">
            <button className={tab === 'mesures' ? 'on' : ''} onClick={() => setTab('mesures')}><Icon name="ruler" size={14} /> Mesures</button>
            <button className={tab === 'place' ? 'on' : ''} onClick={() => setTab('place')}><Icon name="plan" size={14} /> Place</button>
            <button className={tab === 'versions' ? 'on' : ''} onClick={() => setTab('versions')}><Icon name="history" size={14} /> Versions <span className="count">{versions.length}</span></button>
          </div>

          {tab === 'mesures' && (
            <Card>
              <div className="dim-form">
                {CONFIG_FIELDS.map((fd) => {
                  const v = parseFloat(String(draft[fd.key]).replace(',', '.'));
                  const bad = !(Number.isFinite(v) && v > 0);
                  return (
                    <Field key={fd.key} label={fd.label} error={bad ? 'Valeur > 0 requise' : ''}>
                      <div className="unit-input">
                        <input type="number" step={fd.step} min={0.5} value={draft[fd.key]} onChange={(e) => change(fd.key, e.target.value)} />
                        <span>cm</span>
                        {REFERENCE_PLAN[fd.key] !== cfg[fd.key] && <em title={'Référence : ' + f(REFERENCE_PLAN[fd.key])}>réf. {f(REFERENCE_PLAN[fd.key])}</em>}
                      </div>
                    </Field>
                  );
                })}
              </div>
              <div className="calc-box">
                <div title={geo.calcT}><span>Marge transversale</span><b>{f(geo.marginT)} cm de chaque côté</b></div>
                <div title={geo.calcL.join('\n')}><span>Marges longitudinales</span><b>{f(geo.marginTopRowL)} cm (haut) · {f(geo.marginBottomRowL)} cm (bas)</b></div>
                {geo.warnings.map((w) => <div key={w} className="warn-line"><Icon name="alert" size={13} /> {w}</div>)}
              </div>
              <div className="row-actions">
                <Btn
                  small
                  icon="restore"
                  disabled={same(cfg, REFERENCE_PLAN)}
                  onClick={async () => {
                    if (!(await confirm({ title: 'Revenir aux dimensions de référence ?', text: 'Les mesures actuelles seront conservées dans l’historique des versions avant le retour à la référence.', confirm: 'Revenir à la référence' }))) return;
                    await ensureVersioned('Sauvegarde automatique avant retour à la référence');
                    await setKV('planConfig', { ...REFERENCE_PLAN }, 'Retour aux dimensions de référence');
                    lastLogged.current = REFERENCE_PLAN;
                    toast('Dimensions de référence rétablies.');
                  }}
                >
                  Dimensions de référence
                </Btn>
                {matchVer ? <Badge tone="green">Plan = « {matchVer.label} »</Badge> : <Badge tone="orange">Mesures non enregistrées en version</Badge>}
              </div>
            </Card>
          )}

          {tab === 'place' && (
            <Card>
              <div className="place-grid">
                {[...Array(24)].map((_, i) => {
                  const n = i + 1;
                  const has = data.places.some((p) => p.number === n && (p.description || p.observations || p.annotations || p.photoIds.length));
                  return (
                    <button key={n} className={(sel === n ? 'on ' : '') + (n === 1 ? 'pmr ' : '') + (has ? 'has' : '')} onClick={() => setSel(n)} title={n === 1 ? 'Place PMR' : 'Place ' + n}>
                      {n}
                    </button>
                  );
                })}
              </div>
              {!sel || !pg ? (
                <p className="muted small">Choisissez une place sur le plan ou ci-dessus.</p>
              ) : (
                <div className="place-sheet">
                  <div className="ps-head">
                    <h3>Place n°{sel} {pg.pmr && <Badge tone="blue">PMR</Badge>}</h3>
                    <Badge tone="navy" dot={false}>{pcbLabel(pg.pcb)}</Badge>
                  </div>
                  <dl className="dl compact">
                    <dt>Rangée</dt><dd>{pg.row === 'top' ? 'Supérieure' : 'Inférieure'}</dd>
                    <dt>Dimensions</dt><dd>{f(pg.h)} × {f(pg.w)} cm</dd>
                  </dl>
                  {!placeEdit ? (
                    <>
                      <InfoList
                        rows={[
                          ['Description', place?.description],
                          ['Référence', place?.reference],
                          ['Observations', place?.observations],
                          ['Modifications', place?.modifications],
                          ['Annotations', place?.annotations],
                          ['Photos', place?.photoIds?.length ? place.photoIds.length + ' photo(s)' : ''],
                        ]}
                      />
                      {!!place?.photoIds?.length && (
                        <div className="photo-mini small">
                          {place.photoIds.map((id) => data.photos.find((ph) => ph.id === id)).filter(Boolean).slice(0, 4).map((ph) => (
                            <figure key={ph!.id}><img src={blobUrl(ph!.blob)} alt={ph!.description || ph!.name} /></figure>
                          ))}
                        </div>
                      )}
                      <div className="row-actions">
                        <Btn kind="primary" icon="edit" onClick={() => setPlaceEdit(true)}>{place ? 'Modifier la fiche' : 'Remplir la fiche'}</Btn>
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="Description" full><textarea rows={2} value={pf.description} onChange={(e) => setPf({ ...pf, description: e.target.value })} /></Field>
                      <Field label="Référence" full><input value={pf.reference} onChange={(e) => setPf({ ...pf, reference: e.target.value })} /></Field>
                      <details className="more" open={!!(pf.observations || pf.modifications || pf.annotations)}>
                        <summary>Observations, modifications, annotations</summary>
                        <Field label="Observations" full><textarea rows={2} value={pf.observations} onChange={(e) => setPf({ ...pf, observations: e.target.value })} /></Field>
                        <Field label="Modifications" full><textarea rows={2} value={pf.modifications} onChange={(e) => setPf({ ...pf, modifications: e.target.value })} /></Field>
                        <Field label="Annotations" full><textarea rows={2} value={pf.annotations} onChange={(e) => setPf({ ...pf, annotations: e.target.value })} /></Field>
                      </details>
                      <Field label="Photos" full><PhotoPicker value={pf.photoIds || []} onChange={(ids) => setPf({ ...pf, photoIds: ids })} meta={{ category: 'Structure', description: 'Place n°' + sel }} /></Field>
                      <div className="row-actions">
                        <Btn onClick={() => { setPf(place ? { ...place } : emptyPlace(sel)); setPlaceEdit(false); }}>Annuler</Btn>
                        <Btn kind="primary" icon="save" onClick={async () => { await save('places', { ...pf, number: sel }); toast(`Fiche de la place n°${sel} enregistrée.`); setPlaceEdit(false); }}>Enregistrer la fiche</Btn>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}

          {tab === 'versions' && (
            <Card>
              <ul className="versions">
                {verList.visible.map((v) => {
                  const d = diffConfig(v.config, cfg);
                  return (
                    <li key={v.id} className={d.length === 0 ? 'current' : ''}>
                      <div className="v-head">
                        <b>{v.label}</b>
                        {d.length === 0 && <Badge tone="green">Plan actuel</Badge>}
                      </div>
                      <small>{fmtDateTime(v.createdAt)} · {v.createdBy}</small>
                      {v.comment && <p>{v.comment}</p>}
                      <div className="row-actions">
                        <Btn small kind="ghost" icon="eye" onClick={() => setPreview(v)}>Aperçu</Btn>
                        {d.length > 0 && (
                          <Btn
                            small
                            icon="restore"
                            onClick={async () => {
                              if (!(await confirm({ title: `Restaurer « ${v.label} » ?`, text: <>Différences avec le plan actuel :<ul>{d.map((x) => <li key={x}>{x}</li>)}</ul>Le plan actuel sera d'abord archivé s'il n'existe pas déjà dans l'historique.</>, confirm: 'Restaurer' }))) return;
                              await ensureVersioned('Sauvegarde automatique avant restauration de ' + v.label);
                              await setKV('planConfig', { ...v.config }, 'Restauration de la version ' + v.label);
                              toast(`Version « ${v.label} » restaurée.`);
                            }}
                          >
                            Restaurer
                          </Btn>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {verList.control}
            </Card>
          )}
        </div>
      </div>

      {/* Contenu imprimé : cartouche + tableau des places */}
      <div className="print-only print-break-before">
        <h3 className="print-h">Cartouche technique</h3>
        <table className="table print-table">
          <tbody>
            <tr><th>Plaque</th><td>{f(cfg.plateW)} × {f(cfg.plateH)} cm</td><th>Bordures</th><td>{f(cfg.border)} cm</td><th>Surface intérieure</th><td>{f(geo.innerW)} × {f(geo.innerH)} cm</td></tr>
            <tr><th>Allée centrale</th><td>{f(cfg.aisle)} cm</td><th>Place classique</th><td>{f(cfg.placeDepth)} × {f(cfg.placeWidth)} cm</td><th>Place PMR</th><td>{f(cfg.placeDepth)} × {f(cfg.pmrWidth)} cm</td></tr>
            <tr><th>Places</th><td>23 classiques + 1 PMR = 24</td><th>PCB</th><td>12 (1 pour 2 places)</td><th>Version</th><td>{versions.find((v) => same(v.config, cfg))?.label || 'Non enregistrée'}</td></tr>
          </tbody>
        </table>
        <p className="calc">Transversal : {geo.calcT}</p>
        {geo.calcL.map((l) => <p className="calc" key={l}>{l}</p>)}
        <h3 className="print-h">Fiches des places</h3>
        <table className="table print-table">
          <thead><tr><th>N°</th><th>Type</th><th>Rangée</th><th>PCB</th><th>Dimensions</th><th>Description / observations</th></tr></thead>
          <tbody>
            {[...geo.places].sort((a, b) => a.number - b.number).map((p) => {
              const info = data.places.find((x) => x.number === p.number);
              return (
                <tr key={p.number}>
                  <td><b>{p.number}</b></td><td>{p.pmr ? 'PMR' : 'Classique'}</td><td>{p.row === 'top' ? 'Supérieure' : 'Inférieure'}</td><td>{pcbLabel(p.pcb)}</td><td>{f(p.h)} × {f(p.w)}</td>
                  <td>{[info?.description, info?.observations, info?.annotations].filter(Boolean).join(' — ') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3 className="print-h">Historique des versions du plan</h3>
        <table className="table print-table">
          <thead><tr><th>Version</th><th>Date</th><th>Auteur</th><th>Commentaire</th></tr></thead>
          <tbody>{versions.map((v) => <tr key={v.id}><td>{v.label}</td><td>{fmtDateTime(v.createdAt)}</td><td>{v.createdBy}</td><td>{v.comment}</td></tr>)}</tbody>
        </table>
      </div>

      {verModal && (
        <Modal
          title="Enregistrer une version du plan"
          icon="save"
          onClose={() => setVerModal(false)}
          footer={
            <>
              <Btn onClick={() => setVerModal(false)}>Annuler</Btn>
              <Btn
                kind="primary"
                icon="save"
                onClick={async () => {
                  if (!verComment.trim()) return toast('Ajoutez un commentaire décrivant la version.', 'err');
                  await save('planVersions', { label: `v${data.planVersions.length + 1}`, comment: verComment.trim(), config: { ...cfg } });
                  toast('Version du plan enregistrée.');
                  setVerModal(false);
                }}
              >
                Enregistrer
              </Btn>
            </>
          }
        >
          <p className="muted small">Nouvelle version : v{data.planVersions.length + 1}. {diffVer.length ? 'Changements depuis la dernière version : ' + diffVer.join(' ; ') : 'Aucun changement depuis la dernière version.'}</p>
          <Field label="Commentaire *" full><textarea rows={3} value={verComment} onChange={(e) => setVerComment(e.target.value)} placeholder="Ex. : allée élargie à 22 cm pour le passage des véhicules" /></Field>
        </Modal>
      )}
      {preview && (
        <Modal title={'Aperçu – ' + preview.label} icon="eye" wide onClose={() => setPreview(null)}>
          <p className="muted small">{preview.comment}</p>
          <div className="plan-preview"><ParkingPlan geo={computeGeometry(preview.config)} options={{ ...DEFAULT_OPTIONS, margins: false, marks: false }} /></div>
        </Modal>
      )}
    </PageShell>
  );
}

function toDraft(c: PlanConfig) {
  const o: any = {};
  for (const k of Object.keys(c)) o[k] = String((c as any)[k]);
  return o as Record<keyof PlanConfig, string>;
}
function parseDraft(d: Record<keyof PlanConfig, string>): PlanConfig {
  const o: any = {};
  for (const k of Object.keys(d)) o[k] = parseFloat(String((d as any)[k]).replace(',', '.'));
  return o;
}
