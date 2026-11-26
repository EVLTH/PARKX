// Store central : charge IndexedDB en mémoire et écrit chaque modification immédiatement (sauvegarde automatique).
// Une modification n'apparaît à l'écran qu'une fois réellement enregistrée ; en cas d'échec, l'erreur est affichée.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  describeStorageError,
  idbClear,
  idbDelete,
  idbDeleteMany,
  idbGet,
  idbGetAll,
  idbPut,
  idbPutMany,
  requestPersistence,
  storageMode,
  storageReason,
  type StoreName,
} from './idb';
import { BLOB_COLLECTIONS, COLLECTIONS, type Activity, type BackupInfo, type CollName, type Collections, type KV, type Snapshot, type StorageInfo } from './types';
import { REFERENCE_PLAN } from './types';
import { defaultProject, defaultSettings, demoJournal, demoTasks, emptyPcbs, referenceVersion } from './demo';
import { nowISO, uid } from '../lib/utils';
import { hydrateCollection, type BackupFile } from './backup';
import { SyncEngine, type Change, type Engine, type RemoteItem, type SyncInfo } from './sync';
import { FirebaseSync } from './firebaseSync';
import { CONFIG } from '../config';

export type DataState = { [K in CollName]: Collections[K][] } & { activity: Activity[]; kv: KV };

const ENTITY: Record<CollName, string> = {
  tasks: 'Tâche',
  pcbs: 'PCB',
  photos: 'Photo',
  documents: 'Document',
  journal: 'Journal',
  places: 'Place',
  planVersions: 'Plan',
};

export function itemLabel(c: CollName, it: any): string {
  if (c === 'pcbs') return 'PCB ' + String(it.number).padStart(2, '0');
  if (c === 'places') return 'Place n°' + it.number;
  return it.name || it.title || it.label || '(sans titre)';
}

/** Échec d'enregistrement : la modification n'a PAS été conservée (déjà signalé à l'écran). */
export class SaveError extends Error {
  name = 'SaveError';
}

export interface SaveInfo {
  /** ok : tout est enregistré ; saving : écriture en cours ; error : la dernière écriture a échoué */
  state: 'ok' | 'saving' | 'error';
  at: string;
  error: string;
  seq: number;
}

export interface StorageState {
  mode: 'disk' | 'memory';
  reason: string;
  persisted: boolean | null;
}

interface StoreApi {
  ready: boolean;
  error: string;
  data: DataState;
  user: string;
  lastSaved: string;
  revision: number;
  saveInfo: SaveInfo;
  storage: StorageState;
  askPersist: () => Promise<boolean | null>;
  save: <K extends CollName>(c: K, item: Partial<Collections[K]>, opts?: { silent?: boolean; label?: string }) => Promise<Collections[K]>;
  remove: (c: CollName, id: string) => Promise<void>;
  setKV: <K extends keyof KV>(key: K, value: KV[K], label?: string) => Promise<void>;
  markBackup: (patch: Partial<BackupInfo>) => Promise<void>;
  log: (action: Activity['action'], entity: string, label: string) => Promise<void>;
  takeSnapshot: (reason: string) => Promise<void>;
  listSnapshots: () => Promise<Snapshot[]>;
  restoreSnapshot: (s: Snapshot) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  applyBackup: (b: BackupFile, mode: 'replace' | 'merge', strategy: 'recent' | 'local' | 'import') => Promise<{ added: number; updated: number; conflicts: number }>;
  removeDemo: () => Promise<number>;
  resetAll: (withDemo?: boolean) => Promise<void>;
  sync: SyncInfo;
  syncNow: () => Promise<void>;
  /** serveur PHP : code d'accès ; Firebase : mot de passe du compte d'équipe. Renvoie '' si c'est bon, sinon l'erreur. */
  setAccessCode: (code: string) => Promise<string>;
  /** Firebase : déconnecte cet ordinateur du compte d'équipe */
  signOutSync: () => Promise<void>;
}

const Ctx = createContext<StoreApi | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('Store absent');
  return c;
};

const defaultBackupInfo = (): BackupInfo => ({ lastExportAt: '', lastExportName: '', lastExportKind: '', lastImportAt: '', lastImportName: '' });
const defaultStorageInfo = (): StorageInfo => ({ installedAt: '', opens: 0, lastOpenAt: '', persistAsked: false });
const KV_KEYS = ['project', 'settings', 'planConfig', 'led', 'backupInfo', 'storageInfo'] as const;

const emptyState = (): DataState => ({
  tasks: [],
  pcbs: [],
  photos: [],
  documents: [],
  journal: [],
  places: [],
  planVersions: [],
  activity: [],
  kv: { project: defaultProject(), settings: defaultSettings(), planConfig: { ...REFERENCE_PLAN }, led: {}, backupInfo: defaultBackupInfo(), storageInfo: defaultStorageInfo() },
});

const sortState = (st: DataState): DataState => ({ ...st, pcbs: [...st.pcbs].sort((a, b) => a.number - b.number) });

async function loadAll(): Promise<{ st: DataState; empty: boolean; kvKeys: Set<string> }> {
  const st = emptyState();
  for (const c of COLLECTIONS) (st as any)[c] = await idbGetAll(c);
  st.activity = (await idbGetAll<Activity>('activity')).sort((a, b) => b.at.localeCompare(a.at));
  const kvRows = await idbGetAll<{ id: string; value: any }>('kv');
  const kv: any = {};
  kvRows.forEach((r) => (kv[r.id] = r.value));
  st.kv = {
    project: { ...defaultProject(), ...(kv.project || {}) },
    settings: { ...defaultSettings(), ...(kv.settings || {}), autoExport: { ...defaultSettings().autoExport, ...(kv.settings?.autoExport || {}) } },
    planConfig: { ...REFERENCE_PLAN, ...(kv.planConfig || {}) },
    led: kv.led || {},
    backupInfo: { ...defaultBackupInfo(), ...(kv.backupInfo || {}) },
    storageInfo: { ...defaultStorageInfo(), ...(kv.storageInfo || {}) },
  };
  const kvKeys = new Set(kvRows.map((r) => r.id));
  // « Vide » seulement si RIEN n'a jamais été enregistré : jamais de démo par-dessus des données existantes
  const empty = COLLECTIONS.every((c) => !(st as any)[c].length) && !st.activity.length && !KV_KEYS.some((k) => kvKeys.has(k));
  return { st, empty, kvKeys };
}

/** Applique des opérations (données reçues du serveur ou d'un autre onglet) à l'état affiché. */
function applyOps(d: DataState, ops: any[]): DataState {
  const nd: any = { ...d };
  for (const op of ops) {
    if (op.t === 'put') {
      const arr = nd[op.c] as any[];
      nd[op.c] = arr.some((x) => x.id === op.r.id) ? arr.map((x) => (x.id === op.r.id ? op.r : x)) : [...arr, op.r];
    } else if (op.t === 'del') nd[op.c] = (nd[op.c] as any[]).filter((x) => x.id !== op.id);
    else if (op.t === 'act') nd.activity = nd.activity.some((a: Activity) => a.id === op.r.id) ? nd.activity : [op.r, ...nd.activity];
    else if (op.t === 'kv') nd.kv = { ...nd.kv, [op.key]: op.value };
    else if (op.t === 'team') nd.kv = { ...nd.kv, settings: { ...nd.kv.settings, contributors: op.value } };
  }
  nd.activity = [...nd.activity].sort((a: Activity, b: Activity) => b.at.localeCompare(a.at)).slice(0, 800);
  nd.pcbs = [...nd.pcbs].sort((a: any, b: any) => a.number - b.number);
  return nd;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DataState>(emptyState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState('');
  const [revision, setRevision] = useState(0);
  const [saveInfo, setSaveInfo] = useState<SaveInfo>({ state: 'ok', at: '', error: '', seq: 0 });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({ mode: 'local', backend: 'local', state: 'local', lastSync: '', message: '', protectedServer: false });
  const ref = useRef(data);
  ref.current = data;
  const syncRef = useRef<Engine | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const pending = useRef(0);

  const bump = () => {
    setLastSaved(nowISO());
    setRevision((r) => r + 1);
  };
  /** Prévient les autres onglets ouverts sur PARKX qu'une donnée a changé. */
  const notify = (m: any) => {
    try {
      bcRef.current?.postMessage(m);
    } catch {
      /* onglet unique */
    }
  };

  /** Suit une écriture : « Enregistré » seulement quand le navigateur l'a confirmée, erreur visible sinon. */
  const track = useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    // « Enregistrement… » dès le début de l'écriture : « Enregistré » n'est affiché qu'une fois l'écriture terminée
    pending.current++;
    setSaveInfo((s) => (s.state === 'error' ? s : { ...s, state: 'saving' }));
    try {
      const r = await p;
      pending.current--;
      if (!pending.current) setSaveInfo((s) => ({ state: 'ok', at: nowISO(), error: '', seq: s.seq }));
      return r;
    } catch (e) {
      pending.current--;
      const msg = describeStorageError(e);
      setSaveInfo((s) => ({ state: 'error', at: s.at, error: msg, seq: s.seq + 1 }));
      throw new SaveError(msg);
    }
  }, []);

  const init = useCallback(async (seedDemo = true) => {
    try {
      const res = await loadAll();
      let st: DataState = res.st;
      if (res.empty) {
        // Tout premier lancement (rien d'enregistré) : structure du projet + quelques exemples marqués « DÉMO »
        const pcbs = emptyPcbs();
        const versions = [referenceVersion()];
        const tasks = seedDemo ? demoTasks() : [];
        const journal = seedDemo ? demoJournal() : [];
        await idbPutMany('pcbs', pcbs);
        await idbPutMany('planVersions', versions);
        await idbPutMany('tasks', tasks);
        await idbPutMany('journal', journal);
        st = { ...st, pcbs, tasks, planVersions: versions, journal };
      }
      // Réglages absents : valeurs par défaut (n'écrase rien d'existant)
      for (const k of ['project', 'settings', 'planConfig', 'led'] as const) if (!res.kvKeys.has(k)) await idbPut('kv', { id: k, value: st.kv[k] });
      // 12 fiches PCB : seules les fiches manquantes sont créées
      if (st.pcbs.length < 12) {
        const missing = emptyPcbs().filter((p) => !st.pcbs.some((x) => x.number === p.number || x.id === p.id));
        await idbPutMany('pcbs', missing);
        st = { ...st, pcbs: [...st.pcbs, ...missing] };
      }
      // Suivi du stockage : date du premier enregistrement et nombre d'ouvertures (écriture de contrôle)
      const t = nowISO();
      const si: StorageInfo = { ...st.kv.storageInfo, installedAt: st.kv.storageInfo.installedAt || t, opens: (st.kv.storageInfo.opens || 0) + 1, lastOpenAt: t };
      const askNow = !si.persistAsked;
      si.persistAsked = true;
      await idbPut('kv', { id: 'storageInfo', value: si });
      st = { ...st, kv: { ...st.kv, storageInfo: si } };
      setData(sortState(st));
      setReady(true);
      setSaveInfo((s) => ({ ...s, state: 'ok', at: s.at || '' }));
      // Demande au navigateur de ne pas effacer les données pour faire de la place (une seule demande par appareil)
      requestPersistence(storageMode() === 'disk' && askNow).then(setPersisted);
    } catch (e: any) {
      setError(describeStorageError(e));
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  // Fermeture de l'onglet pendant une écriture (quelques millisecondes) : le navigateur demande confirmation
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (pending.current > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // Erreurs d'enregistrement non interceptées par une page : déjà affichées, inutile de les remonter à la console
  useEffect(() => {
    const h = (e: PromiseRejectionEvent) => {
      if (e.reason?.name === 'SaveError') e.preventDefault();
    };
    window.addEventListener('unhandledrejection', h);
    return () => window.removeEventListener('unhandledrejection', h);
  }, []);

  const user = data.kv.settings.currentUser || 'Contributeur';

  const log = useCallback(async (action: Activity['action'], entity: string, label: string) => {
    const a: Activity = { id: uid('a-'), at: nowISO(), author: ref.current.kv.settings.currentUser || 'Contributeur', action, entity, label };
    const prev = syncRef.current?.queue({ k: 'rec', c: 'activity', id: a.id }, true, a);
    try {
      await track(idbPut('activity', a));
    } catch {
      // L'historique est secondaire : l'erreur est affichée, la modification principale reste enregistrée
      syncRef.current?.revert('activity:' + a.id, prev);
      return;
    }
    setData((d) => ({ ...d, activity: [a, ...d.activity].slice(0, 800) }));
    notify({ t: 'rec', c: 'activity', id: a.id });
  }, [track]);

  const save: StoreApi['save'] = useCallback(
    async (c, item, opts) => {
      const who = ref.current.kv.settings.currentUser || 'Contributeur';
      const list = ref.current[c] as any[];
      const existing = item.id ? list.find((x) => x.id === item.id) : undefined;
      const t = nowISO();
      const full: any = existing
        ? { ...existing, ...item, updatedAt: t, updatedBy: who }
        : { ...item, id: item.id || uid(c.slice(0, 2) + '-'), createdAt: t, updatedAt: t, createdBy: who, updatedBy: who };
      // Mise en file d'envoi AVANT l'écriture : une donnée reçue du serveur ne peut pas écraser cette modification
      const prev = syncRef.current?.queue({ k: 'rec', c, id: full.id }, true, full);
      try {
        await track(idbPut(c, full));
      } catch (e) {
        syncRef.current?.revert(c + ':' + full.id, prev);
        throw e;
      }
      setData((d) => {
        const arr = d[c] as any[];
        const next = arr.some((x) => x.id === full.id) ? arr.map((x) => (x.id === full.id ? full : x)) : [...arr, full];
        return { ...d, [c]: next };
      });
      notify({ t: 'rec', c, id: full.id });
      if (!opts?.silent) await log(existing ? 'modification' : 'création', ENTITY[c], opts?.label || itemLabel(c, full));
      bump();
      return full;
    },
    [log, track]
  );

  const remove = useCallback(
    async (c: CollName, id: string) => {
      const it = (ref.current[c] as any[]).find((x) => x.id === id);
      const prev = syncRef.current?.queue({ k: 'del', c, id, at: nowISO() });
      try {
        await track(idbDelete(c, id));
      } catch (e) {
        syncRef.current?.revert(c + ':' + id, prev);
        throw e;
      }
      setData((d) => ({ ...d, [c]: (d[c] as any[]).filter((x) => x.id !== id) }));
      notify({ t: 'rec', c, id });
      if (it) await log('suppression', ENTITY[c], itemLabel(c, it));
      bump();
    },
    [log, track]
  );

  const setKV = useCallback(
    async <K extends keyof KV>(key: K, value: KV[K], label?: string) => {
      const prevTeam = ref.current.kv.settings.contributors;
      const shared = key === 'project' || key === 'planConfig' || key === 'led';
      const teamChanged = key === 'settings' && JSON.stringify((value as any).contributors) !== JSON.stringify(prevTeam);
      const p1 = shared ? syncRef.current?.queue({ k: 'kv', key }, true, value) : undefined;
      const p2 = teamChanged ? syncRef.current?.queue({ k: 'kv', key: 'team' }, true, (value as any).contributors) : undefined;
      try {
        await track(idbPut('kv', { id: key, value }));
      } catch (e) {
        if (shared) syncRef.current?.revert('kv:' + key, p1);
        if (teamChanged) syncRef.current?.revert('kv:team', p2);
        throw e;
      }
      setData((d) => ({ ...d, kv: { ...d.kv, [key]: value } }));
      notify({ t: 'kv', key });
      if (label) await log('modification', key === 'project' ? 'Projet' : key === 'planConfig' ? 'Plan' : key === 'led' ? 'Schéma' : 'Paramètres', label);
      if (shared) bump();
    },
    [log, track]
  );

  const markBackup = useCallback(async (patch: Partial<BackupInfo>) => {
    await setKV('backupInfo', { ...ref.current.kv.backupInfo, ...patch });
  }, [setKV]);

  // ---------- Instantanés internes (hors fichiers binaires) ----------
  const snapshotPayload = () => {
    const d = ref.current;
    const o: any = { kv: { project: d.kv.project, planConfig: d.kv.planConfig, led: d.kv.led } };
    for (const c of COLLECTIONS) if (!BLOB_COLLECTIONS.includes(c)) o[c] = d[c];
    return JSON.stringify(o);
  };
  const takeSnapshot = useCallback(async (reason: string) => {
    const s: Snapshot = { id: uid('s-'), at: nowISO(), author: ref.current.kv.settings.currentUser || 'Contributeur', reason, payload: snapshotPayload() };
    await track(idbPut('snapshots', s));
    const all = (await idbGetAll<Snapshot>('snapshots')).sort((a, b) => b.at.localeCompare(a.at));
    await idbDeleteMany('snapshots', all.slice(20).map((x) => x.id));
  }, [track]);
  const listSnapshots = useCallback(async () => (await idbGetAll<Snapshot>('snapshots')).sort((a, b) => b.at.localeCompare(a.at)), []);
  const deleteSnapshot = useCallback(async (id: string) => track(idbDelete('snapshots', id)), [track]);
  const restoreSnapshot = useCallback(
    async (s: Snapshot) => {
      await takeSnapshot('Avant restauration de l’instantané du ' + new Date(s.at).toLocaleString('fr-FR'));
      const o = JSON.parse(s.payload);
      const remote = !!syncRef.current?.isRemote();
      const recs: { c: string; r: any }[] = [];
      const dels: { c: string; id: string }[] = [];
      const kvKeys: string[] = [];
      await track(
        (async () => {
          for (const c of COLLECTIONS) {
            if (BLOB_COLLECTIONS.includes(c) || !o[c]) continue;
            const list = (o[c] as any[]).filter((x) => !(remote && x.demo));
            const ids = new Set(list.map((x) => x.id));
            for (const x of ref.current[c] as any[]) if (!ids.has(x.id) && !x.demo) dels.push({ c, id: x.id });
            list.forEach((r) => recs.push({ c, r }));
            await idbClear(c);
            await idbPutMany(c, list);
          }
          for (const k of ['project', 'planConfig', 'led'] as const)
            if (o.kv?.[k]) {
              await idbPut('kv', { id: k, value: o.kv[k] });
              kvKeys.push(k);
            }
        })()
      );
      const res = await loadAll();
      setData(sortState(res.st));
      notify({ t: 'reload' });
      await log('restauration', 'Sauvegarde', 'Instantané du ' + new Date(s.at).toLocaleString('fr-FR'));
      syncRef.current?.queueMany(recs, dels, kvKeys);
      bump();
    },
    [log, takeSnapshot, track]
  );

  // ---------- Import ----------
  const applyBackup: StoreApi['applyBackup'] = useCallback(
    async (b, mode, strategy) => {
      await takeSnapshot('Avant import (' + (mode === 'replace' ? 'remplacement' : 'fusion') + ')');
      let added = 0,
        updated = 0,
        conflicts = 0;
      // Serveur partagé : les exemples de démonstration ne sont pas importés, et ce qui est importé est envoyé à toute l'équipe
      const remote = !!syncRef.current?.isRemote();
      const recs: { c: string; r: any }[] = [];
      const dels: { c: string; id: string }[] = [];
      const kvKeys: string[] = [];
      await track(
        (async () => {
          for (const c of COLLECTIONS) {
            const incomingRaw = b.data[c];
            if (!incomingRaw) continue;
            const incoming = (await hydrateCollection(c, incomingRaw)).filter((x: any) => !(remote && x.demo));
            if (mode === 'replace') {
              const ids = new Set(incoming.map((x: any) => x.id));
              for (const x of ref.current[c] as any[]) if (!ids.has(x.id) && !x.demo) dels.push({ c, id: x.id });
              incoming.forEach((r: any) => recs.push({ c, r }));
              await idbClear(c);
              await idbPutMany(c, incoming);
              added += incoming.length;
              continue;
            }
            const local = ref.current[c] as any[];
            const toWrite: any[] = [];
            for (const it of incoming) {
              const l = local.find((x) => x.id === it.id);
              if (!l) {
                toWrite.push(it);
                added++;
                continue;
              }
              if ((l.updatedAt || '') === (it.updatedAt || '')) continue;
              conflicts++;
              // Une fiche par défaut jamais remplie (PCB vide, plan de référence) cède toujours la place à une fiche remplie
              const pristine = (x: any) => x.createdBy === 'Système' && x.updatedAt === x.createdAt;
              const takeImport =
                strategy === 'import' || (strategy === 'recent' && (pristine(l) !== pristine(it) ? pristine(l) : (it.updatedAt || '') > (l.updatedAt || '')));
              if (takeImport) {
                toWrite.push(it);
                updated++;
              }
            }
            await idbPutMany(c, toWrite);
            toWrite.forEach((r) => recs.push({ c, r }));
          }
          if (b.kv) {
            for (const k of ['project', 'planConfig', 'led'] as const) {
              if (!b.kv[k]) continue;
              if (mode === 'replace' || strategy === 'import') {
                await idbPut('kv', { id: k, value: b.kv[k] });
                kvKeys.push(k);
              }
            }
            if (mode === 'replace' && b.kv.settings) {
              const cur = ref.current.kv.settings;
              const contributors = Array.from(new Set([...(cur.contributors || []), ...((b.kv.settings as any).contributors || [])]));
              await idbPut('kv', { id: 'settings', value: { ...cur, contributors } });
              if (contributors.length !== (cur.contributors || []).length) kvKeys.push('team');
            }
          }
          if (b.activity?.length) {
            const known = new Set(ref.current.activity.map((a) => a.id));
            await idbPutMany('activity', b.activity);
            b.activity.filter((a) => !known.has(a.id)).forEach((r) => recs.push({ c: 'activity', r }));
          }
        })()
      );
      const res = await loadAll();
      setData(sortState(res.st));
      notify({ t: 'reload' });
      await log('import', 'Sauvegarde', `Import ${mode === 'replace' ? 'avec remplacement' : 'par fusion'} — fichier de ${b.exportedBy || '?'} du ${new Date(b.exportedAt).toLocaleString('fr-FR')}`);
      syncRef.current?.queueMany(recs, dels, kvKeys);
      bump();
      return { added, updated, conflicts };
    },
    [log, takeSnapshot, track]
  );

  const removeDemo = useCallback(async () => {
    let n = 0;
    await track(
      (async () => {
        for (const c of COLLECTIONS) {
          const ids = (ref.current[c] as any[]).filter((x) => x.demo).map((x) => x.id);
          await idbDeleteMany(c, ids);
          n += ids.length;
        }
      })()
    );
    setData((d) => {
      const nd: any = { ...d };
      for (const c of COLLECTIONS) nd[c] = (d[c] as any[]).filter((x) => !x.demo);
      return nd;
    });
    notify({ t: 'reload' });
    await log('suppression', 'Démo', `${n} donnée(s) de démonstration supprimée(s)`);
    bump();
    return n;
  }, [log, track]);

  const resetAll = useCallback(
    async (withDemo = false) => {
      await takeSnapshot('Avant réinitialisation complète');
      syncRef.current?.stop();
      syncRef.current = null;
      await track(
        (async () => {
          for (const c of [...COLLECTIONS, 'activity', 'kv'] as const) await idbClear(c as StoreName);
        })()
      );
      setReady(false);
      await init(withDemo);
      notify({ t: 'reload' });
      bump();
    },
    [init, takeSnapshot, track]
  );

  const askPersist = useCallback(async () => {
    const p = await requestPersistence(true);
    setPersisted(p);
    return p;
  }, []);

  // ---------- Plusieurs onglets ouverts : chacun reprend les modifications des autres ----------
  useEffect(() => {
    if (!ready) return;
    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel('parkx-donnees');
    } catch {
      return;
    }
    bcRef.current = bc;
    bc.onmessage = async (ev) => {
      const m = ev.data || {};
      try {
        if (m.t === 'reload') {
          const res = await loadAll();
          setData(sortState(res.st));
        } else if (m.t === 'kv' && typeof m.key === 'string') {
          const row = await idbGet<{ id: string; value: any }>('kv', m.key);
          if (row) setData((d) => ({ ...d, kv: { ...d.kv, [m.key]: row.value } }));
        } else if (m.t === 'rec' && typeof m.c === 'string' && typeof m.id === 'string') {
          const r = await idbGet<any>(m.c as StoreName, m.id);
          setData((d) => applyOps(d, [r ? (m.c === 'activity' ? { t: 'act', r } : { t: 'put', c: m.c, r }) : { t: 'del', c: m.c, id: m.id }]));
        } else return;
        setRevision((x) => x + 1);
      } catch {
        /* donnée illisible : ignorée */
      }
    };
    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [ready]);

  // ---------- Serveur partagé (api.php) ----------
  useEffect(() => {
    if (!ready) return;
    const host: ConstructorParameters<typeof SyncEngine>[0] = {
      getRecord: (c, id) => (c === 'activity' ? ref.current.activity.find((a) => a.id === id) : ((ref.current as any)[c] as any[] | undefined)?.find((x) => x.id === id)),
      allRecords: () => {
        const out: { c: string; r: any }[] = [];
        for (const c of COLLECTIONS) for (const r of ref.current[c] as any[]) out.push({ c, r });
        for (const a of ref.current.activity) out.push({ c: 'activity', r: a });
        return out;
      },
      getKV: (key) => (key === 'team' ? ref.current.kv.settings.contributors : (ref.current.kv as any)[key]),
      applyRemote: async (items: RemoteItem[], kv, skip) => {
        const ops: any[] = [];
        const puts: Record<string, any[]> = {};
        const dels: Record<string, string[]> = {};
        const d = ref.current;
        for (const it of items) {
          const id = (it.r?.id ?? it.id) as string;
          const key = it.c + ':' + id;
          if (!id || skip(key)) continue;
          if (it.c === 'activity') {
            if (it.del || !it.r || d.activity.some((a) => a.id === id)) continue;
            (puts.activity ||= []).push(it.r);
            ops.push({ t: 'act', r: it.r, key });
            continue;
          }
          if (!(COLLECTIONS as string[]).includes(it.c)) continue;
          const list = (d as any)[it.c] as any[];
          const cur = list.find((x) => x.id === id);
          if (it.del) {
            if (cur) {
              (dels[it.c] ||= []).push(id);
              ops.push({ t: 'del', c: it.c, id, key });
            }
            continue;
          }
          const r = it.r;
          // Même version déjà présente (par exemple sa propre modification renvoyée par le serveur)
          if (cur && (cur.updatedAt || '') === (r.updatedAt || '') && (cur.updatedBy || '') === (r.updatedBy || '')) continue;
          const full = BLOB_COLLECTIONS.includes(it.c as CollName) ? { ...r, blob: cur?.blob && cur.blob.size ? cur.blob : new Blob([], { type: r.mime || '' }) } : r;
          (puts[it.c] ||= []).push(full);
          ops.push({ t: 'put', c: it.c, r: full, key });
        }
        for (const [c, arr] of Object.entries(puts)) await idbPutMany(c as StoreName, arr);
        for (const [c, ids] of Object.entries(dels)) await idbDeleteMany(c as StoreName, ids);
        for (const [k, e] of Object.entries(kv)) {
          const key = 'kv:' + k;
          if (skip(key)) continue;
          if (k === 'team') {
            if (!Array.isArray(e.v)) continue;
            await idbPut('kv', { id: 'settings', value: { ...ref.current.kv.settings, contributors: e.v } });
            ops.push({ t: 'team', value: e.v, k: key });
          } else if ((k === 'project' || k === 'planConfig' || k === 'led') && e.v) {
            await idbPut('kv', { id: k, value: e.v });
            ops.push({ t: 'kv', key: k, value: e.v, k: key });
          }
        }
        if (!ops.length) return;
        setData((cur) => {
          // Une modification faite ici entre-temps reste prioritaire
          const nd = applyOps(cur, ops.filter((op) => !skip(op.k || op.key)));
          ref.current = nd;
          return nd;
        });
        setRevision((r) => r + 1);
      },
      setBlob: async (c, id, received) => {
        const cur = ((ref.current as any)[c] as any[]).find((x) => x.id === id);
        if (!cur) return;
        // Le type du fichier est celui de sa fiche (vérifié à l'affichage), jamais celui annoncé par le serveur
        const blob = cur.mime && received.type !== cur.mime ? new Blob([received], { type: cur.mime }) : received;
        await idbPut(c as CollName, { ...cur, blob });
        setData((d) => ({ ...d, [c]: ((d as any)[c] as any[]).map((x) => (x.id === id ? { ...x, blob } : x)) }));
      },
      missingBlobs: () =>
        BLOB_COLLECTIONS.flatMap((c) => ((ref.current as any)[c] as any[]).filter((r) => !r.blob || !r.blob.size).map((r) => ({ c, id: r.id }))),
      removeLocalDemo: async () => {
        for (const c of COLLECTIONS) await idbDeleteMany(c, (ref.current[c] as any[]).filter((x) => x.demo).map((x) => x.id));
        setData((d) => {
          const nd: any = { ...d };
          for (const c of COLLECTIONS) nd[c] = (d[c] as any[]).filter((x) => !x.demo);
          ref.current = nd;
          return nd;
        });
      },
      user: () => ref.current.kv.settings.currentUser || 'Contributeur',
      onInfo: (i) => setSyncInfo({ ...i }),
    };
    // Firebase s'il est configuré dans reglages.js, sinon serveur PHP (api.php) s'il existe, sinon local uniquement
    const eng: Engine = CONFIG.firebase.actif ? new FirebaseSync(host) : new SyncEngine(host);
    syncRef.current = eng;
    eng.start();
    return () => {
      eng.stop();
      syncRef.current = null;
    };
  }, [ready]);

  const syncNow = useCallback(async () => {
    await syncRef.current?.syncNow();
  }, []);
  const setAccessCode = useCallback(async (code: string) => {
    const eng = syncRef.current;
    if (eng?.signIn) return eng.signIn(code);
    try {
      localStorage.setItem('parkx-code', code.trim());
    } catch {
      /* stockage indisponible */
    }
    eng?.syncNow();
    return '';
  }, []);
  const signOutSync = useCallback(async () => {
    await syncRef.current?.signOut?.();
  }, []);

  const storage: StorageState = useMemo(() => ({ mode: storageMode(), reason: storageReason(), persisted }), [ready, persisted]);

  const api = useMemo<StoreApi>(
    () => ({ ready, error, data, user, lastSaved, revision, saveInfo, storage, askPersist, save, remove, setKV, markBackup, log, takeSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, applyBackup, removeDemo, resetAll, sync: syncInfo, syncNow, setAccessCode, signOutSync }),
    [ready, error, data, user, lastSaved, revision, saveInfo, storage, askPersist, save, remove, setKV, markBackup, log, takeSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, applyBackup, removeDemo, resetAll, syncInfo, syncNow, setAccessCode, signOutSync]
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** URL d'objet mise en cache pour un Blob (photos, documents). */
const urlCache = new WeakMap<Blob, string>();
export function blobUrl(b?: Blob) {
  if (!b) return '';
  let u = urlCache.get(b);
  if (!u) {
    u = URL.createObjectURL(b);
    urlCache.set(b, u);
  }
  return u;
}

export type { Change };
