// Accès IndexedDB minimal, sans dépendance externe.
// - Écritures « durables » : une modification n'est confirmée qu'une fois écrite sur le disque par le navigateur
//   (elle survit à la fermeture du navigateur et à l'arrêt de l'ordinateur).
// - Si le navigateur interdit le stockage (aperçu intégré dans un autre site, réglages de confidentialité…),
//   PARKX passe en « mémoire seule » et l'affiche clairement : rien n'est alors conservé à la fermeture.
const DB_NAME = 'parkx-db';
const DB_VERSION = 1;
export const STORES = ['tasks', 'pcbs', 'photos', 'documents', 'journal', 'places', 'planVersions', 'activity', 'kv', 'snapshots'] as const;
export type StoreName = (typeof STORES)[number];

let mode: 'disk' | 'memory' = 'disk';
let reason = '';
/** « disk » : données enregistrées dans le navigateur ; « memory » : rien n'est conservé à la fermeture. */
export const storageMode = () => mode;
export const storageReason = () => reason;

const mem = new Map<string, Map<string, any>>();
const memStore = (s: string) => {
  let m = mem.get(s);
  if (!m) mem.set(s, (m = new Map()));
  return m;
};

/** Message compréhensible pour une erreur du stockage du navigateur. */
export function describeStorageError(e: any): string {
  const name = e?.name || '';
  if (name === 'QuotaExceededError') return 'espace de stockage du navigateur plein (supprimez des photos ou documents volumineux, ou libérez de la place sur le disque)';
  if (name === 'SecurityError') return 'le navigateur interdit le stockage pour cette page (page intégrée dans un autre site, ou réglages de confidentialité)';
  if (name === 'InvalidStateError') return 'le stockage du navigateur est indisponible (navigation privée stricte ou données du site en cours d’effacement)';
  if (name === 'DataCloneError') return 'donnée impossible à enregistrer (fichier illisible)';
  if (name === 'UnknownError') return 'erreur interne du stockage du navigateur (redémarrez le navigateur)';
  if (name === 'VersionError') return 'une version plus récente de PARKX a déjà été ouverte dans ce navigateur';
  return e?.message || String(e || 'erreur inconnue');
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let done = false;
    const fail = (why: string) => {
      if (done) return;
      done = true;
      mode = 'memory';
      reason = why;
      resolve(null);
    };
    const timer = window.setTimeout(() => fail('le stockage du navigateur ne répond pas'), 15000);
    let req: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return fail('ce navigateur ne propose pas de stockage (IndexedDB)');
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      window.clearTimeout(timer);
      return fail(describeStorageError(e));
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      window.clearTimeout(timer);
      const db = req.result;
      // Une autre fenêtre ouvre une version plus récente : on libère la base au lieu de la bloquer
      db.onversionchange = () => db.close();
      if (done) return db.close();
      done = true;
      resolve(db);
    };
    req.onerror = () => {
      window.clearTimeout(timer);
      fail(describeStorageError(req.error));
    };
  });
  return dbPromise;
}

function run<T>(db: IDBDatabase, store: StoreName, m: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction;
    try {
      // « strict » : la transaction ne se termine qu'une fois les données écrites sur le disque
      t = m === 'readwrite' ? db.transaction(store, m, { durability: 'strict' } as any) : db.transaction(store, m);
    } catch (e) {
      reject(e);
      return;
    }
    let r: IDBRequest<T> | void;
    try {
      r = fn(t.objectStore(store));
    } catch (e) {
      try {
        t.abort();
      } catch {
        /* déjà terminée */
      }
      reject(e);
      return;
    }
    let result: T;
    if (r) r.onsuccess = () => (result = (r as IDBRequest<T>).result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new DOMException('Enregistrement annulé par le navigateur', 'AbortError'));
  });
}

/** Exécute une opération ; si la connexion a été fermée par le navigateur, la rouvre une fois. */
async function op<T>(store: StoreName, m: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void, memFn: () => T): Promise<T> {
  const db = await openDB();
  if (!db) return memFn();
  try {
    return await run(db, store, m, fn);
  } catch (e: any) {
    if (e?.name !== 'InvalidStateError') throw e;
    dbPromise = null;
    const again = await openDB();
    if (!again) return memFn();
    return run(again, store, m, fn);
  }
}

export const idbGetAll = <T>(store: StoreName) => op<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>, () => Array.from(memStore(store).values()) as T[]);
export const idbGet = <T>(store: StoreName, id: string) => op<T>(store, 'readonly', (s) => s.get(id) as IDBRequest<T>, () => memStore(store).get(id) as T);
export const idbPut = <T>(store: StoreName, value: T) =>
  op<IDBValidKey>(store, 'readwrite', (s) => s.put(value), () => {
    memStore(store).set((value as any).id, value);
    return (value as any).id;
  });
export const idbDelete = (store: StoreName, id: string) =>
  op<undefined>(store, 'readwrite', (s) => s.delete(id), () => {
    memStore(store).delete(id);
    return undefined;
  });
export const idbClear = (store: StoreName) =>
  op<undefined>(store, 'readwrite', (s) => s.clear(), () => {
    memStore(store).clear();
    return undefined;
  });

/** Plusieurs éléments en une seule transaction (tout ou rien). */
export const idbPutMany = <T>(store: StoreName, values: T[]) =>
  values.length
    ? op<void>(store, 'readwrite', (s) => void values.forEach((v) => s.put(v)), () => {
        values.forEach((v) => memStore(store).set((v as any).id, v));
      })
    : Promise.resolve();

export const idbDeleteMany = (store: StoreName, ids: string[]) =>
  ids.length
    ? op<void>(store, 'readwrite', (s) => void ids.forEach((id) => s.delete(id)), () => {
        ids.forEach((id) => memStore(store).delete(id));
      })
    : Promise.resolve();

/**
 * Demande au navigateur de ne jamais effacer les données de PARKX pour faire de la place.
 * Retourne true si c'est accordé, false si le navigateur garde le droit d'effacer, null si la question n'a pas de sens ici.
 */
export async function requestPersistence(ask: boolean): Promise<boolean | null> {
  try {
    const st = navigator.storage;
    if (!st?.persisted) return null;
    if (await st.persisted()) return true;
    if (ask && st.persist) return await st.persist();
    return false;
  } catch {
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}
