import { useEffect, useRef, useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { blobUrl, useStore } from '../db/store';
import type { DocFile } from '../db/types';
import { ActionMenu, Btn, Empty, Field, FormSection, Modal, usePrinting, useShowMore, useSort, useUI } from '../components/ui';
import { downloadBlob, fmtDate, fmtSize, normalize } from '../lib/utils';
import { Icon } from '../components/Icons';

export const DOC_CATEGORIES = ['Plans', 'Schémas électriques', 'Fiches techniques', 'Notices', 'Factures', 'Devis', 'Documents PDF', 'Documents de fabrication', 'Autres'];
const MAX = 40 * 1024 * 1024;

function guessCat(f: File) {
  const n = f.name.toLowerCase();
  if (/facture|invoice/.test(n)) return 'Factures';
  if (/devis|quote/.test(n)) return 'Devis';
  if (/schema|schéma|wiring|kicad|sch/.test(n)) return 'Schémas électriques';
  if (/plan|dxf|dwg/.test(n)) return 'Plans';
  if (/notice|manuel|manual/.test(n)) return 'Notices';
  if (/datasheet|fiche/.test(n)) return 'Fiches techniques';
  if (f.type === 'application/pdf') return 'Documents PDF';
  return 'Autres';
}
const ext = (n: string) => (n.split('.').pop() || '').toUpperCase().slice(0, 4);

export default function Documents({ param }: { param?: string }) {
  const { data, save, remove } = useStore();
  const { toast, confirm } = useUI();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<DocFile | null>(null);
  const [view, setView] = useState<DocFile | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const d = param && data.documents.find((x) => x.id === param);
    if (d) setView(d);
  }, [param]);

  const list = data.documents.filter((d) => (!cat || d.category === cat) && (!q || normalize(d.name + ' ' + d.description + ' ' + d.category).includes(normalize(q))));
  const { sorted, th } = useSort(list, { key: 'createdAt', dir: -1 });
  const more = useShowMore(sorted, 15);
  const printing = usePrinting();
  const rows = printing ? sorted : more.visible;

  const upload = async (files: FileList | File[]) => {
    let n = 0;
    for (const f of Array.from(files)) {
      if (f.size > MAX) {
        toast(`« ${f.name} » dépasse 40 Mo et n'a pas été ajouté.`, 'err');
        continue;
      }
      await save('documents', { name: f.name, category: guessCat(f), description: '', mime: f.type || 'application/octet-stream', size: f.size, blob: f });
      n++;
    }
    if (n) toast(`${n} document(s) ajouté(s).`);
  };
  const del = async (d: DocFile) => {
    if (await confirm({ title: 'Supprimer le document ?', text: <>« {d.name} » sera définitivement supprimé de PARKX.</>, confirm: 'Supprimer', danger: true })) {
      await remove('documents', d.id);
      for (const j of data.journal.filter((j) => j.docIds.includes(d.id))) await save('journal', { id: j.id, docIds: j.docIds.filter((x) => x !== d.id) }, { silent: true });
      toast('Document supprimé.');
      setView(null);
    }
  };
  // Aperçu limité aux formats sans script (un fichier HTML ou SVG ouvert ici pourrait agir sur les données du site)
  const frameOk = (m: string) => m === 'application/pdf' || /^text\/(plain|csv|markdown)$/.test(m);
  const imgOk = (m: string) => m.startsWith('image/');
  const canPreview = (d: DocFile) => imgOk(d.mime) || frameOk(d.mime);
  const openInTab = (d: DocFile) => {
    if (frameOk(d.mime) || (imgOk(d.mime) && d.mime !== 'image/svg+xml')) window.open(blobUrl(d.blob), '_blank', 'noopener');
    else downloadBlob(d.blob, d.name);
  };

  return (
    <PageShell
      title="Documents techniques"
      icon="folder"
      actions={
        <>
          <Btn kind="primary" icon="upload" onClick={() => input.current?.click()}>Ajouter des documents</Btn>
          <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
        </>
      }
    >
      <div
        className={'drop-area ' + (drag ? 'over' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      >
        {drag && <div className="drop-hint no-print"><Icon name="upload" size={20} /> Déposez vos fichiers ici</div>}
        <div className="toolbar no-print">
          <div className="search-in"><Icon name="search" size={14} /><input placeholder="Rechercher un document…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
            <option value="">Toutes les catégories ({data.documents.length})</option>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c} ({data.documents.filter((d) => d.category === c).length})</option>
            ))}
          </select>
        </div>

        {sorted.length === 0 ? (
          <Empty icon="folder" title={data.documents.length ? 'Aucun document pour cette recherche' : 'Aucun document'} text="Ajoutez vos plans, schémas et fiches techniques, ou glissez-les ici." />
        ) : (
          <Card pad={false}>
            <div className="table-wrap">
              <table className="table hover">
                <thead>
                  <tr>
                    {th('name', 'Document')}
                    {th('createdAt', 'Ajouté le')}
                    {th('category', 'Catégorie', 'print-col')}
                    {th('size', 'Taille', 'print-col')}
                    {th('createdBy', 'Par', 'print-col')}
                    <th className="no-print col-act" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} onClick={() => setView(d)}>
                      <td>
                        <div className="doc-name">
                          <span className="doc-ext">{ext(d.name)}</span>
                          <div>
                            <div className="cell-title">{d.name}</div>
                            <div className="cell-sub">{d.category} · {fmtSize(d.size)}</div>
                          </div>
                        </div>
                      </td>
                      <td>{fmtDate(d.createdAt)}</td>
                      <td className="print-col">{d.category}</td>
                      <td className="print-col">{fmtSize(d.size)}</td>
                      <td className="print-col">{d.createdBy}</td>
                      <td className="no-print col-act" onClick={(e) => e.stopPropagation()}>
                        <span className="row-btns">
                        <Btn small kind="ghost" icon="edit" aria-label="Modifier" title="Modifier" onClick={() => setEdit({ ...d })} />
                        <ActionMenu items={[
                          { label: 'Consulter', icon: 'eye', onClick: () => setView(d) },
                          { label: 'Télécharger', icon: 'download', onClick: () => downloadBlob(d.blob, d.name) },
                          { label: 'Modifier', icon: 'edit', onClick: () => setEdit({ ...d }) },
                          { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => del(d) },
                        ]} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {more.control}
      </div>

      {view && (
        <Modal
          wide
          title={view.name}
          icon="file"
          onClose={() => setView(null)}
          footer={
            <>
              <Btn kind="danger" icon="trash" className="mr-auto" onClick={() => del(view)}>Supprimer</Btn>
              <Btn icon="edit" onClick={() => { setEdit({ ...view }); setView(null); }}>Modifier</Btn>
              <Btn icon="eye" onClick={() => openInTab(view)}>Ouvrir dans un onglet</Btn>
              <Btn kind="primary" icon="download" onClick={() => downloadBlob(view.blob, view.name)}>Télécharger</Btn>
            </>
          }
        >
          <p className="muted small">{view.category} · {fmtSize(view.size)} · ajouté le {fmtDate(view.createdAt)} par {view.createdBy}{view.description ? ' — ' + view.description : ''}</p>
          {canPreview(view) ? (
            view.mime.startsWith('image/') ? <img className="doc-preview-img" src={blobUrl(view.blob)} alt={view.name} /> : <iframe className="doc-preview" src={blobUrl(view.blob)} title={view.name} {...(view.mime === 'application/pdf' ? {} : { sandbox: '' })} />
          ) : (
            <Empty icon="file" title="Aperçu non disponible pour ce format" text="Téléchargez le fichier pour l'ouvrir avec le logiciel adapté." />
          )}
        </Modal>
      )}

      {edit && (
        <Modal
          title="Modifier le document"
          icon="edit"
          onClose={() => setEdit(null)}
          footer={
            <>
              <Btn onClick={() => setEdit(null)}>Annuler</Btn>
              <Btn kind="primary" icon="save" onClick={async () => { if (!edit.name.trim()) return toast('Le nom est obligatoire.', 'err'); await save('documents', edit); toast('Document mis à jour.'); setEdit(null); }}>Enregistrer</Btn>
            </>
          }
        >
          <FormSection title="Informations">
            <Field label="Nom *" full><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Catégorie" full>
              <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Description" full><textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </FormSection>
        </Modal>
      )}
    </PageShell>
  );
}
