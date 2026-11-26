import { useRef, useState } from 'react';
import { blobUrl, useStore } from '../db/store';
import type { Photo } from '../db/types';
import { compressImage, todayISO } from '../lib/utils';
import { Icon } from './Icons';
import { Btn, Modal, useUI } from './ui';

export const PHOTO_CATEGORIES = ['Structure', 'Marquage', 'Électronique', 'PCB', 'Câblage', 'Finitions', 'Avant', 'Après', 'Divers'];

export function useAddPhotos() {
  const { save } = useStore();
  const { toast } = useUI();
  return async (files: FileList | File[], meta: Partial<Photo> = {}) => {
    const ids: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) {
        toast(`« ${f.name} » n'est pas une image.`, 'err');
        continue;
      }
      const blob = await compressImage(f);
      const p = await save('photos', { name: f.name.replace(/\.[^.]+$/, ''), description: '', date: todayISO(), category: 'Divers', taskId: '', mime: blob.type || f.type, blob, ...meta } as Partial<Photo>);
      ids.push(p.id);
    }
    if (ids.length) toast(`${ids.length} photo(s) ajoutée(s) à la galerie.`);
    return ids;
  };
}

export function Thumbs({ ids, onRemove, size = 64 }: { ids: string[]; onRemove?: (id: string) => void; size?: number }) {
  const { data } = useStore();
  const photos = ids.map((id) => data.photos.find((p) => p.id === id)).filter(Boolean) as Photo[];
  if (!photos.length) return null;
  return (
    <div className="thumbs">
      {photos.map((p) => (
        <div className="thumb" key={p.id} style={{ width: size, height: size }} title={p.name}>
          <img src={blobUrl(p.blob)} alt={p.description || p.name} />
          {onRemove && (
            <button className="no-print" onClick={() => onRemove(p.id)} aria-label="Retirer">
              <Icon name="x" size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Associe des photos existantes ou nouvelles à un élément. */
export function PhotoPicker({ value, onChange, meta }: { value: string[]; onChange: (ids: string[]) => void; meta?: Partial<Photo> }) {
  const { data } = useStore();
  const add = useAddPhotos();
  const input = useRef<HTMLInputElement>(null);
  const [lib, setLib] = useState(false);
  return (
    <div className="photo-picker">
      <Thumbs ids={value} onRemove={(id) => onChange(value.filter((x) => x !== id))} />
      <div className="pp-actions">
        <Btn small icon="upload" onClick={() => input.current?.click()}>Importer</Btn>
        <Btn small kind="ghost" icon="image" onClick={() => setLib(true)} disabled={!data.photos.length}>Depuis la galerie</Btn>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            if (!e.target.files?.length) return;
            const ids = await add(e.target.files, meta);
            onChange([...value, ...ids]);
            e.target.value = '';
          }}
        />
      </div>
      {lib && (
        <Modal title="Choisir dans la galerie" onClose={() => setLib(false)} wide icon="image" footer={<Btn kind="primary" onClick={() => setLib(false)}>Terminer</Btn>}>
          <div className="pick-grid">
            {[...data.photos].sort((a, b) => b.date.localeCompare(a.date)).map((p) => {
              const on = value.includes(p.id);
              return (
                <button key={p.id} className={'pick ' + (on ? 'on' : '')} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}>
                  <img src={blobUrl(p.blob)} alt="" />
                  <span>{p.name}</span>
                  {on && <i><Icon name="check" size={12} /></i>}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
