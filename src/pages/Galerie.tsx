import { useEffect, useRef, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { blobUrl, useStore } from '../db/store';
import type { Photo } from '../db/types';
import { ActionMenu, Btn, Empty, Field, FormSection, Modal, usePrinting, useShowMore, useUI } from '../components/ui';
import { PHOTO_CATEGORIES, useAddPhotos } from '../components/PhotoPicker';
import { downloadBlob, fmtDate, normalize } from '../lib/utils';
import { Icon } from '../components/Icons';

export default function Galerie({ param }: { param?: string }) {
  const { data, save, remove } = useStore();
  const { toast, confirm } = useUI();
  const add = useAddPhotos();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState('');
  const [task, setTask] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<number | null>(null);
  const [edit, setEdit] = useState<Photo | null>(null);
  const [cmp, setCmp] = useState<{ a: string; b: string; pos: number } | null>(null);
  const [upCat, setUpCat] = useState('Divers');
  const [drag, setDrag] = useState(false);

  const photos = [...data.photos]
    .filter((p) => (!cat || p.category === cat) && (!task || p.taskId === task) && (!q || normalize(p.name + ' ' + p.description).includes(normalize(q))))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  const cats = Array.from(new Set([...PHOTO_CATEGORIES, ...data.photos.map((p) => p.category)]));
  const more = useShowMore(photos, 24);
  const printing = usePrinting();
  const shown = printing ? photos : more.visible;
  const taskName = (id: string) => data.tasks.find((t) => t.id === id)?.name;

  useEffect(() => {
    if (!param) return;
    // « Ajouter une photo » depuis le tableau de bord : ouvre directement le choix des fichiers
    if (param === 'ajouter') {
      input.current?.click();
      return;
    }
    const i = photos.findIndex((p) => p.id === param);
    if (i >= 0) setView(i);
  }, [param]);

  useEffect(() => {
    if (view === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setView((v) => (v === null ? v : (v + 1) % photos.length));
      if (e.key === 'ArrowLeft') setView((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [view, photos.length]);

  const upload = async (files: FileList | File[]) => {
    await add(files, { category: upCat });
  };
  const del = async (p: Photo) => {
    if (await confirm({ title: 'Supprimer la photo ?', text: <>« {p.name} » sera supprimée de la galerie et retirée des tâches, PCB et entrées associées.</>, confirm: 'Supprimer', danger: true })) {
      await remove('photos', p.id);
      for (const t of data.tasks.filter((t) => t.photoIds.includes(p.id))) await save('tasks', { id: t.id, photoIds: t.photoIds.filter((x) => x !== p.id) }, { silent: true });
      for (const t of data.pcbs.filter((t) => t.photoIds.includes(p.id))) await save('pcbs', { id: t.id, photoIds: t.photoIds.filter((x) => x !== p.id) }, { silent: true });
      for (const t of data.journal.filter((t) => t.photoIds.includes(p.id))) await save('journal', { id: t.id, photoIds: t.photoIds.filter((x) => x !== p.id) }, { silent: true });
      for (const t of data.places.filter((t) => t.photoIds.includes(p.id))) await save('places', { id: t.id, photoIds: t.photoIds.filter((x) => x !== p.id) }, { silent: true });
      toast('Photo supprimée.');
      setView(null);
      setEdit(null);
    }
  };
  const cur = view !== null ? photos[view] : null;

  return (
    <PageShell
      title="Galerie photos"
      icon="image"
      subtitle="Suivi visuel de la réalisation"
      actions={
        <>
          <Btn icon="compare" disabled={data.photos.length < 2} onClick={() => setCmp({ a: photos[photos.length - 1]?.id, b: photos[0]?.id, pos: 50 })}>Comparer avant / après</Btn>
          <Btn kind="primary" icon="upload" onClick={() => input.current?.click()}>Importer des photos</Btn>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
        </>
      }
    >
      <div
        className={'drop-area ' + (drag ? 'over' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      >
      {drag && <div className="drop-hint no-print"><Icon name="upload" size={20} /> Déposez vos photos ici</div>}
      <div className="toolbar no-print">
        <div className="search-in"><Icon name="search" size={14} /><input placeholder="Rechercher une photo…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>Toutes ({data.photos.length})</button>
          {cats.filter((c) => data.photos.some((p) => p.category === c)).map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c} ({data.photos.filter((p) => p.category === c).length})</button>
          ))}
        </div>
      </div>

      {photos.length === 0 ? (
        <Empty icon="image" title={data.photos.length ? 'Aucune photo pour ce filtre' : 'Aucune photo'} text="Importez les photographies de la maquette pour suivre son évolution." />
      ) : (
        <div className="gallery">
          {shown.map((p, i) => (
            <figure key={p.id} className="g-item avoid-break">
              <div className="g-img" onClick={() => setView(i)}>
                <img src={blobUrl(p.blob)} alt={p.description || p.name} loading="lazy" />
                <span className="g-cat">{p.category}</span>
              </div>
              <figcaption>
                <div className="g-top">
                  <b title={p.name}>{p.name || 'Sans titre'}</b>
                  <span className="no-print">
                    <ActionMenu items={[
                      { label: 'Agrandir', icon: 'eye', onClick: () => setView(i) },
                      { label: 'Modifier', icon: 'edit', onClick: () => setEdit({ ...p }) },
                      { label: 'Télécharger', icon: 'download', onClick: () => downloadBlob(p.blob, (p.name || 'photo') + '.' + (p.mime.split('/')[1] || 'jpg')) },
                      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => del(p) },
                    ]} />
                  </span>
                </div>
                <small>{fmtDate(p.date)}</small>
                {p.description && <p className="print-only">{p.description}</p>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {more.control}

      </div>

      {cur && (
        <div className="lightbox no-print" onClick={() => setView(null)}>
          <button className="lb-close" aria-label="Fermer"><Icon name="x" size={20} /></button>
          <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); setView((view! - 1 + photos.length) % photos.length); }} aria-label="Précédente"><Icon name="chevL" size={26} /></button>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={blobUrl(cur.blob)} alt={cur.description || cur.name} />
            <figcaption>
              <div>
                <b>{cur.name}</b> · {fmtDate(cur.date)} · {cur.category}
                {cur.taskId && taskName(cur.taskId) && <> · Étape : {taskName(cur.taskId)}</>}
                {cur.description && <p>{cur.description}</p>}
              </div>
              <span>{view! + 1} / {photos.length}</span>
              <Btn small icon="edit" onClick={() => { setEdit({ ...cur }); }}>Modifier</Btn>
            </figcaption>
          </figure>
          <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); setView((view! + 1) % photos.length); }} aria-label="Suivante"><Icon name="chevR" size={26} /></button>
        </div>
      )}

      {edit && (
        <Modal
          title="Modifier la photo"
          icon="image"
          onClose={() => setEdit(null)}
          footer={
            <>
              <Btn kind="danger" icon="trash" className="mr-auto" onClick={() => del(edit)}>Supprimer</Btn>
              <Btn onClick={() => setEdit(null)}>Annuler</Btn>
              <Btn kind="primary" icon="save" onClick={async () => { await save('photos', edit); toast('Photo mise à jour.'); setEdit(null); }}>Enregistrer</Btn>
            </>
          }
        >
          <div className="edit-photo"><img src={blobUrl(edit.blob)} alt="" /></div>
          <FormSection title="Informations">
            <Field label="Titre" full><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description" full><textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Date"><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Catégorie">
              <input list="ph-cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              <datalist id="ph-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Étape associée" full>
              <select value={edit.taskId} onChange={(e) => setEdit({ ...edit, taskId: e.target.value })}>
                <option value="">Aucune</option>
                {data.tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </FormSection>
        </Modal>
      )}

      {cmp && (
        <Modal wide title="Comparer avant / après" icon="compare" onClose={() => setCmp(null)}>
          <div className="cmp-sel">
            <Field label="Avant">
              <select value={cmp.a} onChange={(e) => setCmp({ ...cmp, a: e.target.value })}>{data.photos.map((p) => <option key={p.id} value={p.id}>{fmtDate(p.date)} — {p.name}</option>)}</select>
            </Field>
            <Field label="Après">
              <select value={cmp.b} onChange={(e) => setCmp({ ...cmp, b: e.target.value })}>{data.photos.map((p) => <option key={p.id} value={p.id}>{fmtDate(p.date)} — {p.name}</option>)}</select>
            </Field>
          </div>
          {(() => {
            const A = data.photos.find((p) => p.id === cmp.a);
            const B = data.photos.find((p) => p.id === cmp.b);
            if (!A || !B) return null;
            return (
              <>
                <div className="cmp">
                  <img src={blobUrl(B.blob)} alt="Après" />
                  <img className="cmp-top" src={blobUrl(A.blob)} alt="Avant" style={{ clipPath: `inset(0 ${100 - cmp.pos}% 0 0)` }} />
                  <div className="cmp-handle" style={{ left: cmp.pos + '%' }} />
                  <span className="cmp-l">AVANT · {fmtDate(A.date)}</span>
                  <span className="cmp-r">APRÈS · {fmtDate(B.date)}</span>
                </div>
                <input type="range" min={0} max={100} value={cmp.pos} onChange={(e) => setCmp({ ...cmp, pos: Number(e.target.value) })} className="cmp-range" aria-label="Curseur de comparaison" />
              </>
            );
          })()}
        </Modal>
      )}
    </PageShell>
  );
}
