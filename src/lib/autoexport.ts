// Export automatique au format .json.
// Mode « fichier » : File System Access API (Chrome / Edge) — le fichier choisi est réécrit à chaque échéance.
// Mode « téléchargement » : un fichier daté est téléchargé à chaque échéance (si des modifications ont eu lieu).
import { useEffect, useRef } from 'react';
import { idbGet, idbPut } from '../db/idb';
import { buildBackup } from '../db/backup';
import { useStore, type DataState } from '../db/store';
import { downloadBlob, stamp } from './utils';

export const fsSupported = () => typeof (window as any).showSaveFilePicker === 'function';

export async function chooseExportFile(): Promise<string> {
  const h = await (window as any).showSaveFilePicker({
    suggestedName: 'parkx-sauvegarde-auto.json',
    types: [{ description: 'Sauvegarde PARKX', accept: { 'application/json': ['.json'] } }],
  });
  await idbPut('kv', { id: 'exportHandle', value: h });
  return h.name as string;
}

export async function getHandle(): Promise<any | null> {
  try {
    const r = await idbGet<{ id: string; value: any }>('kv', 'exportHandle');
    return r?.value || null;
  } catch {
    return null;
  }
}

export async function handlePermission(h: any, ask: boolean): Promise<'granted' | 'prompt' | 'denied'> {
  if (!h?.queryPermission) return 'denied';
  let p = await h.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
  return p;
}

export async function backupText(data: DataState, user: string) {
  return JSON.stringify(await buildBackup(data, user, true));
}

/** Exécute un export selon le mode choisi. Retourne un message d'état. */
export async function runExport(data: DataState, user: string, mode: 'file' | 'download', ask = false): Promise<{ ok: boolean; msg: string; name?: string }> {
  const text = await backupText(data, user);
  if (mode === 'file') {
    const h = await getHandle();
    if (!h) return { ok: false, msg: 'Aucun fichier de destination choisi.' };
    const perm = await handlePermission(h, ask);
    if (perm !== 'granted') return { ok: false, msg: 'Autorisation d’écriture à renouveler (cliquez sur « Exporter maintenant »).' };
    const w = await h.createWritable();
    await w.write(new Blob([text], { type: 'application/json' }));
    await w.close();
    return { ok: true, msg: 'Fichier « ' + h.name + ' » mis à jour.', name: h.name };
  }
  const name = `parkx-auto-${stamp()}.json`;
  downloadBlob(new Blob([text], { type: 'application/json' }), name);
  return { ok: true, msg: 'Fichier téléchargé.', name };
}

/** Hook global : export automatique + instantanés internes périodiques. */
export function useAutoBackup(onStatus: (m: string, ok: boolean) => void) {
  const { data, revision, setKV, markBackup, takeSnapshot, user, ready } = useStore();
  const ref = useRef({ data, revision, user });
  ref.current = { data, revision, user };
  const lastExportRev = useRef(-1);
  const lastSnapRev = useRef(0);
  const s = data.kv.settings;

  // Export automatique .json
  useEffect(() => {
    if (!ready || !s.autoExport.enabled) return;
    lastExportRev.current = lastExportRev.current < 0 ? ref.current.revision : lastExportRev.current;
    const id = window.setInterval(async () => {
      const { data: d, revision: rev, user: u } = ref.current;
      if (rev === lastExportRev.current) return; // rien de nouveau
      try {
        const r = await runExport(d, u, d.kv.settings.autoExport.mode, false);
        if (r.ok) {
          lastExportRev.current = rev;
          const at = new Date().toISOString();
          await setKV('settings', { ...d.kv.settings, autoExport: { ...d.kv.settings.autoExport, lastAt: at } });
          await markBackup({ lastExportAt: at, lastExportName: r.name || '', lastExportKind: 'automatique' });
        }
        onStatus('Export automatique : ' + r.msg, r.ok);
      } catch (e: any) {
        onStatus('Export automatique impossible : ' + (e?.message || e), false);
      }
    }, Math.max(1, s.autoExport.intervalMin) * 60000);
    return () => window.clearInterval(id);
  }, [ready, s.autoExport.enabled, s.autoExport.mode, s.autoExport.intervalMin]);

  // Instantanés internes toutes les 10 minutes s'il y a eu des modifications
  useEffect(() => {
    if (!ready || !s.autoSnapshot) return;
    const id = window.setInterval(() => {
      if (ref.current.revision !== lastSnapRev.current) {
        lastSnapRev.current = ref.current.revision;
        takeSnapshot('Instantané automatique').catch(() => undefined);
      }
    }, 10 * 60000);
    return () => window.clearInterval(id);
  }, [ready, s.autoSnapshot]);
}
