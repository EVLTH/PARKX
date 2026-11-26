// Export / import complet des données PARKX (JSON autonome, fichiers inclus en base64).
import { BLOB_COLLECTIONS, COLLECTIONS, SIGNATURE, type Activity, type CollName, type KV } from './types';
import { blobToDataURL, dataURLToBlob } from '../lib/utils';
import type { DataState } from './store';

export const BACKUP_FORMAT = 'parkx-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: 'PARKX';
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  exportedBy: string;
  signature: string;
  kind: 'complet' | 'instantané';
  data: Record<string, any[]>;
  kv: Partial<KV>;
  activity: Activity[];
}

export async function buildBackup(data: DataState, exportedBy: string, includeFiles = true): Promise<BackupFile> {
  const out: Record<string, any[]> = {};
  for (const c of COLLECTIONS) {
    const items = data[c] as any[];
    if (BLOB_COLLECTIONS.includes(c)) {
      if (!includeFiles) continue;
      out[c] = await Promise.all(
        items.map(async (it) => {
          const { blob, ...rest } = it;
          return { ...rest, dataUrl: blob ? await blobToDataURL(blob) : '' };
        })
      );
    } else out[c] = items;
  }
  const { settings, backupInfo, storageInfo, ...kvRest } = data.kv;
  // Le fichier de partage n'embarque pas les préférences locales (utilisateur courant, export auto).
  return {
    app: 'PARKX',
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    signature: SIGNATURE,
    kind: includeFiles ? 'complet' : 'instantané',
    data: out,
    kv: { ...kvRest, settings: { ...settings, autoExport: { ...settings.autoExport, enabled: false } } as any },
    activity: data.activity.slice(0, 500),
  };
}

export interface ParsedImport {
  backup: BackupFile;
  counts: Record<string, number>;
  warnings: string[];
}

export function parseBackup(text: string): ParsedImport {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  if (!j || j.app !== 'PARKX' || j.format !== BACKUP_FORMAT) throw new Error("Ce fichier n'est pas une sauvegarde PARKX.");
  if (typeof j.version !== 'number' || j.version > BACKUP_VERSION) throw new Error(`Version de sauvegarde non prise en charge (${j.version}).`);
  if (!j.data || typeof j.data !== 'object') throw new Error('Sauvegarde incomplète : section « data » absente.');
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) {
    const arr = j.data[c];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) throw new Error(`Section « ${c} » invalide.`);
    const bad = arr.filter((x: any) => !x || typeof x.id !== 'string');
    if (bad.length) throw new Error(`${bad.length} élément(s) sans identifiant dans « ${c} ».`);
    counts[c] = arr.length;
  }
  if (j.kind === 'instantané') warnings.push('Instantané sans photos ni documents : ceux-ci ne seront pas modifiés.');
  return { backup: j as BackupFile, counts, warnings };
}

/** Reconvertit les fichiers base64 en Blob. */
export async function hydrateCollection(c: CollName, items: any[]) {
  if (!BLOB_COLLECTIONS.includes(c)) return items;
  return Promise.all(
    items.map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: dataUrl ? await dataURLToBlob(dataUrl) : new Blob() }))
  );
}

export const COLL_LABELS: Record<string, string> = {
  tasks: 'Tâches',
  pcbs: 'Fiches PCB',
  photos: 'Photos',
  documents: 'Documents',
  journal: 'Entrées du journal',
  places: 'Fiches des places',
  planVersions: 'Versions du plan',
};
