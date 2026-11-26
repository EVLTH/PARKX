// Synchronisation avec Firebase (Cloud Firestore) : les mêmes données sur plusieurs ordinateurs, en temps réel.
// - Chaque modification est d'abord enregistrée sur l'appareil (IndexedDB), puis envoyée à Firestore.
// - Hors connexion, les modifications attendent dans une file conservée sur l'appareil et partent au retour du réseau.
// - Les modifications des autres arrivent en temps réel (écoute Firestore).
// - Conflit (même élément modifié par deux personnes) : la modification la plus récente l'emporte (transaction),
//   et tous les appareils reprennent la version retenue.
// - Accès : un compte d'équipe Firebase (adresse + mot de passe), demandé une fois par ordinateur.
// - Photos et documents : enregistrés dans Firestore en morceaux (fonctionne avec l'offre gratuite de Firebase).
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { idbGet, idbPut } from './idb';
import { CONFIG } from '../config';
import { edited, SYNC_KV, type Change, type Engine, type KvEntry, type RemoteItem, type SyncHost, type SyncInfo } from './sync';

const COLLS = ['tasks', 'pcbs', 'photos', 'documents', 'journal', 'places', 'planVersions', 'activity'];
const FILE_COLLS = ['photos', 'documents'];
/** caractères base64 par morceau : un document Firestore ne peut pas dépasser 1 Mio */
const PART = 600_000;
const ACTIVITY_MAX = 100;
const keyOf = (ch: Change) => (ch.k === 'kv' ? 'kv:' + ch.key : ch.c + ':' + ch.id);
const nowISO = () => new Date().toISOString();
const iso = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : '');
const ms = (s?: string) => {
  const v = s ? Date.parse(s) : NaN;
  return Number.isFinite(v) ? v : Date.now();
};
/** Firestore refuse les valeurs « undefined » : copie propre de l'objet. */
const clean = (v: any) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

interface Meta {
  outbox: Change[];
  kvAt: Record<string, string>;
  uploaded: Record<string, 1>;
  seeded: boolean;
}

// Une seule instance Firebase par page (la session de connexion est conservée par Firebase dans le navigateur)
let services: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;
function firebase() {
  if (services) return services;
  const app = getApps().find((a) => a.name === 'parkx') || initializeApp(CONFIG.firebase.options, 'parkx');
  const auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  const emu = CONFIG.firebase.emulateur;
  if (emu.auth) connectAuthEmulator(auth, emu.auth.startsWith('http') ? emu.auth : 'http://' + emu.auth, { disableWarnings: true });
  if (emu.firestore) {
    const [h, p] = emu.firestore.split(':');
    connectFirestoreEmulator(db, h, Number(p) || 8080);
  }
  services = { app, auth, db };
  return services;
}

function authMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Mot de passe incorrect.';
    case 'auth/user-not-found':
      return "Compte d'équipe introuvable : créez-le dans Firebase (Authentication > Users) avec l'adresse indiquée dans reglages.js.";
    case 'auth/user-disabled':
      return "Compte d'équipe désactivé dans Firebase (Authentication > Users).";
    case 'auth/too-many-requests':
      return 'Trop d’essais : patientez quelques minutes avant de réessayer.';
    case 'auth/network-request-failed':
      return 'Pas de connexion Internet : réessayez quand la connexion revient.';
    case 'auth/operation-not-allowed':
      return 'Connexion par adresse e-mail et mot de passe non activée dans Firebase (Authentication > Sign-in method).';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Adresse du compte d’équipe invalide dans reglages.js (emailEquipe).';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Clé Firebase (apiKey) invalide dans reglages.js.';
    default:
      return 'Connexion impossible (' + (code || 'erreur inconnue') + ').';
  }
}

function syncMessage(e: any): { state: SyncInfo['state']; message: string } {
  const code = String(e?.code || '');
  if (code === 'permission-denied')
    return { state: 'error', message: "Accès refusé par Firebase : l'adresse du compte d'équipe doit être la même dans reglages.js et dans les règles Firestore (voir FIREBASE.txt)." };
  if (code === 'unauthenticated') return { state: 'auth', message: 'Mot de passe de l’équipe requis.' };
  if (code === 'resource-exhausted') return { state: 'error', message: 'Quota gratuit de Firebase atteint pour aujourd’hui : la synchronisation reprendra plus tard. Vos modifications sont gardées sur cet appareil.' };
  if (code === 'not-found') return { state: 'error', message: 'Base Firestore introuvable : créez-la dans la console Firebase (Firestore Database).' };
  if (code === 'unavailable' || code === 'deadline-exceeded' || !navigator.onLine)
    return { state: 'offline', message: 'Pas de connexion : les modifications sont gardées sur cet appareil et seront envoyées au retour de la connexion.' };
  return { state: 'error', message: 'Erreur de synchronisation : ' + (e?.message || code || e) };
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export class FirebaseSync implements Engine {
  info: SyncInfo = { mode: 'remote', backend: 'firebase', state: 'connecting', lastSync: '', message: 'Connexion à Firebase…', protectedServer: true, account: CONFIG.firebase.emailEquipe };
  meta: Meta = { outbox: [], kvAt: {}, uploaded: {}, seeded: false };
  private db?: Firestore;
  private auth?: Auth;
  private user: User | null = null;
  private loaded = false;
  private stopped = false;
  private unsubs: Unsubscribe[] = [];
  private authUnsub: Unsubscribe | null = null;
  /** collections déjà reçues du serveur pendant cette session */
  private ready = new Set<string>();
  private fromCache: Record<string, boolean> = {};
  private listenError: any = null;
  private pushError: any = null;
  private latest = new Map<string, any>();
  private miss: Record<string, number> = {};
  private work: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private again = false;
  private kickTimer = 0;
  private retryTimer = 0;
  private dlTimer = 0;
  private relistenTimer = 0;
  private warning = '';
  private onOnline = () => {
    this.refresh();
    this.kick(0);
  };
  private onOffline = () => this.refresh();

  constructor(private host: SyncHost) {}

  private set(p: Partial<SyncInfo>) {
    if (this.stopped) return;
    this.info = { ...this.info, ...p, mode: 'remote', backend: 'firebase', account: CONFIG.firebase.emailEquipe };
    this.host.onInfo(this.info);
  }
  private async saveMeta() {
    if (this.stopped || !this.loaded) return;
    await idbPut('kv', { id: 'fbMeta', value: this.meta });
  }
  private isPending(key: string) {
    return this.meta.outbox.some((x) => keyOf(x) === key);
  }
  private col(...path: string[]) {
    return collection(this.db!, 'parkx', CONFIG.firebase.projet, ...(path as [string]));
  }
  private ref(...path: string[]) {
    return doc(this.db!, 'parkx', CONFIG.firebase.projet, ...(path as [string]));
  }
  /** Tâche exécutée après les précédentes (pas de traitement simultané des données reçues). */
  private serial(fn: () => Promise<void>) {
    this.work = this.work.then(fn).catch((e) => {
      console.warn('PARKX Firebase :', e);
    });
    return this.work;
  }

  // ------------------------------------------------------------------
  async start() {
    const early = this.meta;
    const m = await idbGet<{ id: string; value: Meta }>('kv', 'fbMeta').catch(() => undefined);
    this.meta = { outbox: [], kvAt: {}, uploaded: {}, seeded: false, ...(m?.value || {}) };
    for (const ch of early.outbox) {
      const k = keyOf(ch);
      this.meta.outbox = [...this.meta.outbox.filter((x) => keyOf(x) !== k), ch];
    }
    Object.assign(this.meta.kvAt, early.kvAt);
    this.loaded = true;
    if (this.stopped) return;
    if (early.outbox.length) await this.saveMeta();
    if (!CONFIG.firebase.emailEquipe) {
      this.set({ state: 'error', message: "Adresse du compte d'équipe manquante dans reglages.js (firebase > emailEquipe)." });
      return;
    }
    try {
      const f = firebase();
      this.db = f.db;
      this.auth = f.auth;
    } catch (e: any) {
      this.set({ state: 'error', message: 'Configuration Firebase invalide dans reglages.js : ' + (e?.message || e) });
      return;
    }
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.set({ state: 'connecting', message: 'Connexion à Firebase…' });
    this.authUnsub = onAuthStateChanged(this.auth, (u) => this.onUser(u));
  }

  stop() {
    this.stopped = true;
    this.detach();
    this.authUnsub?.();
    window.clearTimeout(this.kickTimer);
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.dlTimer);
    window.clearTimeout(this.relistenTimer);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  isRemote() {
    return true;
  }

  async signIn(secret: string): Promise<string> {
    if (!this.auth) return this.info.message || 'Firebase n’est pas prêt.';
    try {
      await signInWithEmailAndPassword(this.auth, CONFIG.firebase.emailEquipe, secret);
      return '';
    } catch (e: any) {
      return authMessage(String(e?.code || ''));
    }
  }

  async signOut() {
    if (this.auth) await signOut(this.auth);
  }

  private onUser(u: User | null) {
    if (this.stopped) return;
    this.user = u;
    this.detach();
    if (!u) {
      this.set({ state: 'auth', message: "Mot de passe de l'équipe requis pour synchroniser. En attendant, vos modifications sont gardées sur cet appareil." });
      return;
    }
    this.attach();
  }

  private detach() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.ready.clear();
    this.fromCache = {};
    this.listenError = null;
  }

  private attach() {
    if (!this.db) return;
    this.set({ state: 'pending', message: 'Synchronisation en cours…' });
    // Toute première synchronisation de cet appareil : les exemples de démonstration restent en local et sont retirés
    if (!this.meta.seeded) this.serial(() => this.host.removeLocalDemo());
    const listen = (name: string, q: any) =>
      this.unsubs.push(
        onSnapshot(
          q,
          { includeMetadataChanges: true },
          (snap: QuerySnapshot) => this.onSnap(name, snap),
          (err) => {
            // Écoute arrêtée par Firebase (droits, connexion…) : nouvel essai automatique
            this.listenError = err;
            this.refresh();
            window.clearTimeout(this.relistenTimer);
            this.relistenTimer = window.setTimeout(() => {
              if (this.stopped || !this.user) return;
              this.detach();
              this.attach();
            }, String(err?.code) === 'permission-denied' ? 30_000 : 5_000);
          }
        )
      );
    for (const c of COLLS) listen(c, c === 'activity' ? query(this.col('activity'), orderBy('_t', 'desc'), limit(ACTIVITY_MAX)) : this.col(c));
    listen('kv', this.col('kv'));
  }

  // ---------- Données reçues ----------
  private toItem(c: string, d: DocumentSnapshot): RemoteItem {
    const data: any = d.data() || {};
    const t = iso(data._t);
    if (data._del) return { c, id: d.id, del: true, at: t, t };
    const { _t, _by, _del, ...r } = data;
    return { c, r: { ...r, id: d.id }, t };
  }

  private onSnap(c: string, snap: QuerySnapshot) {
    if (this.stopped) return;
    this.fromCache[c] = snap.metadata.fromCache;
    this.listenError = null;
    // Tant que le serveur n'a pas répondu, ce n'est pas encore l'état partagé : on attend
    if (snap.metadata.fromCache && !this.ready.has(c)) {
      this.refresh();
      return;
    }
    const first = !this.ready.has(c);
    if (first) this.ready.add(c);
    const docs = first ? snap.docs : snap.docChanges().filter((x) => x.type !== 'removed').map((x) => x.doc);
    if (!docs.length && !first) {
      this.refresh();
      return;
    }
    this.serial(async () => {
      if (this.stopped) return;
      if (c === 'kv') await this.receiveKv(docs, first);
      else await this.receive(c, docs, first);
      if (first && this.ready.size === COLLS.length + 1 && !this.meta.seeded) {
        this.meta.seeded = true;
        await this.saveMeta();
      }
      if (FILE_COLLS.includes(c)) this.scheduleDownloads(300);
      this.kick(first ? 0 : 400);
      this.refresh();
    });
  }

  /**
   * Première réception d'une collection : le serveur fait foi pour ce qu'il contient, sauf les éléments
   * modifiés ici plus récemment ; ce qui n'existe que sur cet appareil lui est envoyé (rien n'est perdu).
   */
  private async receive(c: string, docs: DocumentSnapshot[], first: boolean) {
    const onServer = new Set<string>();
    const apply: RemoteItem[] = [];
    for (const d of docs) {
      const it = this.toItem(c, d);
      const key = c + ':' + d.id;
      onServer.add(key);
      if (this.isPending(key)) continue;
      if (first && c !== 'activity') {
        const local = this.host.getRecord(c, d.id);
        if (local && !local.demo && edited(local) && local.updatedAt > (it.t || '')) {
          this.queue({ k: 'rec', c, id: d.id, t: local.updatedAt }, false);
          continue;
        }
      }
      apply.push(it);
    }
    if (apply.length) await this.host.applyRemote(apply, {}, (k) => this.isPending(k));
    if (first && (c !== 'activity' || !this.meta.seeded)) {
      for (const { c: cc, r } of this.host.allRecords())
        if (cc === c && !r.demo && !onServer.has(c + ':' + r.id)) this.queue({ k: 'rec', c, id: r.id, t: r.updatedAt || r.at || nowISO() }, false);
      await this.saveMeta();
    }
  }

  private async receiveKv(docs: DocumentSnapshot[], first: boolean) {
    const onServer = new Set<string>();
    const kv: Record<string, KvEntry> = {};
    let team: KvEntry | null = null;
    for (const d of docs) {
      const data: any = d.data() || {};
      const key = d.id;
      onServer.add(key);
      const e: KvEntry = { v: data.v, at: iso(data._t) };
      if (this.isPending('kv:' + key)) {
        // Nouvel arrivant : son nom s'ajoute à l'équipe sans en retirer personne
        if (first && key === 'team' && Array.isArray(e.v)) team = { v: Array.from(new Set([...e.v, ...((this.host.getKV('team') as string[]) || [])])), at: this.meta.kvAt.team || nowISO() };
        continue;
      }
      kv[key] = e;
      this.meta.kvAt[key] = e.at;
    }
    if (Object.keys(kv).length) await this.host.applyRemote([], kv, (k) => this.isPending(k));
    if (team) {
      this.latest.set('kv:team', team.v);
      await this.host.applyRemote([], { team }, () => false);
    }
    if (first) {
      for (const key of SYNC_KV) if (!onServer.has(key) && this.host.getKV(key) !== undefined) this.queue({ k: 'kv', key, t: this.meta.kvAt[key] || nowISO() }, false);
      await this.saveMeta();
    }
  }

  // ---------- État affiché ----------
  private refresh() {
    if (this.stopped || !this.user) return;
    const err = this.listenError || this.pushError;
    const m = err ? syncMessage(err) : null;
    if (m && m.state !== 'offline') return this.set(m);
    if (!navigator.onLine || m?.state === 'offline' || Object.values(this.fromCache).some(Boolean))
      return this.set({ state: 'offline', message: 'Pas de connexion : les modifications sont gardées sur cet appareil et seront envoyées au retour de la connexion.' });
    if (this.ready.size < COLLS.length + 1 || this.meta.outbox.length || this.flushing) return this.set({ state: 'pending', message: 'Synchronisation en cours…' });
    this.set({ state: 'synced', lastSync: nowISO(), message: this.warning });
  }

  // ---------- Modifications locales ----------
  queue(ch: Change, persist = true, rec?: any): Change | undefined {
    if (this.stopped) return undefined;
    if (ch.k === 'kv') {
      ch = { ...ch, t: ch.t || nowISO() };
      this.meta.kvAt[ch.key] = ch.t!;
    } else if (ch.k === 'rec') ch = { ...ch, t: ch.t || nowISO() };
    const k = keyOf(ch);
    const prev = this.meta.outbox.find((x) => keyOf(x) === k);
    if (ch.k !== 'del' && rec !== undefined) this.latest.set(k, rec);
    else this.latest.delete(k);
    this.meta.outbox = [...this.meta.outbox.filter((x) => keyOf(x) !== k), ch];
    if (persist) this.saveMeta();
    if (this.info.state === 'synced') this.set({ state: 'pending', message: 'Synchronisation en cours…' });
    this.kick(300);
    return prev;
  }

  revert(key: string, prev?: Change) {
    if (this.stopped) return;
    this.meta.outbox = this.meta.outbox.filter((x) => keyOf(x) !== key);
    this.latest.delete(key);
    if (prev) this.meta.outbox.push(prev);
    this.saveMeta();
    this.refresh();
  }

  queueMany(recs: { c: string; r: any }[], dels: { c: string; id: string }[], kvKeys: string[]) {
    if (this.stopped) return;
    const t = nowISO();
    for (const { c, r } of recs) if (r && !r.demo) this.queue({ k: 'rec', c, id: r.id, t }, false, r);
    for (const { c, id } of dels) this.queue({ k: 'del', c, id, at: t }, false);
    for (const key of kvKeys) this.queue({ k: 'kv', key, t }, false);
    this.saveMeta();
  }

  async syncNow() {
    window.clearTimeout(this.retryTimer);
    this.miss = {};
    this.pushError = null;
    await this.flush();
    this.scheduleDownloads(0);
    this.refresh();
  }

  private kick(delay: number) {
    if (this.stopped) return;
    window.clearTimeout(this.kickTimer);
    this.kickTimer = window.setTimeout(() => this.flush(), delay);
  }

  private recordFor(ch: Change) {
    if (ch.k !== 'rec') return undefined;
    return this.latest.get(keyOf(ch)) ?? this.host.getRecord(ch.c, ch.id);
  }

  /** Données envoyées à Firestore pour une modification (null : rien à envoyer). */
  private payload(ch: Change, t: number): any {
    const by = this.host.user();
    if (ch.k === 'del') return { _del: true, _t: t, _by: by };
    if (ch.k === 'kv') {
      const k = keyOf(ch);
      const v = this.latest.has(k) ? this.latest.get(k) : this.host.getKV(ch.key);
      return v === undefined ? null : { v: clean(v), _t: t, _by: by };
    }
    const r = this.recordFor(ch);
    if (!r || r.demo) return null;
    const { blob, ...rest } = r;
    return { ...clean(rest), _t: t, _by: by };
  }
  private timeOf(ch: Change) {
    return ch.k === 'del' ? ms(ch.at) : ch.k === 'kv' ? ms(this.meta.kvAt[ch.key] || ch.t) : ms(ch.t);
  }

  /** Envoi de la file : une transaction par lot, la modification la plus récente l'emporte. */
  private flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    if (!this.user || !this.db || this.stopped || !this.meta.outbox.length || !navigator.onLine) {
      if (!this.meta.outbox.length) this.pushError = null; // plus rien à envoyer
      this.refresh();
      return Promise.resolve();
    }
    this.flushing = (async () => {
      try {
        do {
          this.again = false;
          while (this.meta.outbox.length && !this.stopped && this.user) {
            const batch = this.meta.outbox.slice(0, 20);
            await this.pushBatch(batch);
          }
        } while (this.again && !this.stopped);
        this.pushError = null;
      } catch (e: any) {
        this.pushError = e;
        const m = syncMessage(e);
        if (m.state === 'auth') this.set(m);
        window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.flush(), m.state === 'offline' ? 5000 : 15000);
      } finally {
        this.flushing = null;
        this.refresh();
      }
    })();
    this.refresh();
    return this.flushing;
  }

  private async pushBatch(batch: Change[]) {
    // 1) photos et documents : le fichier part avant sa fiche
    for (const ch of batch) {
      if (ch.k !== 'rec' || !FILE_COLLS.includes(ch.c) || this.meta.uploaded[ch.id]) continue;
      const r = this.recordFor(ch);
      if (r?.blob?.size && !r.demo) await this.uploadFile(ch.id, r.blob, r.mime || r.blob.type);
      this.meta.uploaded[ch.id] = 1;
    }
    // 2) fiches et réglages partagés
    const conflicts: RemoteItem[] = [];
    const kvConf: Record<string, KvEntry> = {};
    const plan = batch.map((ch) => ({ ch, ref: ch.k === 'kv' ? this.ref('kv', ch.key) : this.ref(ch.c, ch.id), t: this.timeOf(ch) }));
    try {
      await runTransaction(this.db!, async (tx) => {
        conflicts.length = 0;
        for (const k of Object.keys(kvConf)) delete kvConf[k];
        // l'historique ne fait qu'ajouter des lignes : pas besoin de relire le serveur
        const reads = await Promise.all(plan.map((p) => (p.ch.k === 'rec' && p.ch.c === 'activity' ? Promise.resolve(null) : tx.get(p.ref))));
        plan.forEach(({ ch, ref, t }, i) => {
          const snap = reads[i];
          const cur: any = snap && snap.exists() ? snap.data() : null;
          if (cur && typeof cur._t === 'number' && cur._t > t) {
            // version du serveur plus récente (modifiée par quelqu'un d'autre) : conservée
            if (ch.k === 'kv') kvConf[ch.key] = { v: cur.v, at: iso(cur._t) };
            else conflicts.push(this.toItem(ch.c, snap as DocumentSnapshot));
            return;
          }
          if (cur && cur._t === t) return; // déjà à jour
          const data = this.payload(ch, t);
          if (data) tx.set(ref, data);
        });
      });
    } catch (e: any) {
      // Un élément refusé (trop volumineux, invalide) ne doit pas bloquer les autres
      if (String(e?.code) === 'invalid-argument' && batch.length > 1) {
        for (const ch of batch) await this.pushBatch([ch]);
        return;
      }
      if (String(e?.code) === 'invalid-argument') {
        this.warning = 'Un élément n’a pas pu être envoyé à Firebase (donnée invalide ou trop volumineuse) : il reste sur cet appareil.';
        this.meta.outbox = this.meta.outbox.filter((x) => x !== batch[0]);
        await this.saveMeta();
        return;
      }
      throw e;
    }
    if (this.stopped) return;
    this.meta.outbox = this.meta.outbox.filter((x) => !batch.includes(x));
    const still = new Set(this.meta.outbox.map(keyOf));
    for (const ch of batch) if (!still.has(keyOf(ch))) this.latest.delete(keyOf(ch));
    const conf = conflicts.filter((it) => !this.isPending(it.c + ':' + (it.r?.id ?? it.id)));
    const kvc: Record<string, KvEntry> = {};
    for (const [k, e] of Object.entries(kvConf)) {
      if (this.isPending('kv:' + k)) continue;
      kvc[k] = e;
      this.meta.kvAt[k] = e.at;
    }
    if (conf.length || Object.keys(kvc).length) await this.host.applyRemote(conf, kvc, (k) => this.isPending(k));
    await this.saveMeta();
    // 3) fichiers des photos et documents supprimés : place libérée
    for (const ch of batch) if (ch.k === 'del' && FILE_COLLS.includes(ch.c)) this.deleteFile(ch.id).catch(() => undefined);
  }

  // ---------- Fichiers (photos, documents) en morceaux ----------
  private async uploadFile(id: string, blob: Blob, mime: string) {
    const b64 = await blobToBase64(blob);
    const n = Math.max(1, Math.ceil(b64.length / PART));
    for (let i = 0; i < n; i += 8) {
      const wb = writeBatch(this.db!);
      for (let j = i; j < Math.min(n, i + 8); j++) wb.set(this.ref('files', id, 'parts', String(j)), { i: j, d: b64.slice(j * PART, (j + 1) * PART) });
      await wb.commit();
    }
    await setDoc(this.ref('files', id), { parts: n, size: blob.size, mime: mime || 'application/octet-stream', _t: Date.now(), _by: this.host.user() });
  }

  private async deleteFile(id: string) {
    const parts = await getDocs(this.col('files', id, 'parts'));
    const wb = writeBatch(this.db!);
    parts.docs.forEach((d) => wb.delete(d.ref));
    wb.delete(this.ref('files', id));
    await wb.commit();
  }

  private scheduleDownloads(delay: number) {
    window.clearTimeout(this.dlTimer);
    this.dlTimer = window.setTimeout(() => this.serial(() => this.downloadFiles()), delay);
  }

  /** Photos et documents ajoutés par les autres : téléchargés progressivement. */
  private async downloadFiles() {
    if (this.stopped || !this.user || !navigator.onLine) return;
    const t = Date.now();
    const list = this.host.missingBlobs().filter(({ id }) => !((this.miss[id] || 0) > t));
    let again = false;
    for (const { c, id } of list.slice(0, 6)) {
      if (this.stopped) return;
      try {
        const meta = await getDoc(this.ref('files', id));
        if (!meta.exists()) {
          this.miss[id] = t + 60_000; // fichier pas encore envoyé par l'autre appareil
          again = true;
          continue;
        }
        const { parts, mime } = meta.data() as any;
        const qs = await getDocs(this.col('files', id, 'parts'));
        const arr = qs.docs.map((d) => d.data() as any).sort((a, b) => a.i - b.i);
        if (arr.length < parts) {
          this.miss[id] = t + 60_000;
          again = true;
          continue;
        }
        await this.host.setBlob(c, id, base64ToBlob(arr.map((x) => x.d).join(''), mime));
      } catch {
        this.miss[id] = t + 60_000;
        again = true;
      }
    }
    if (list.length > 6 || again) this.scheduleDownloads(again ? 60_000 : 500);
  }
}
