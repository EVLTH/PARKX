// Synchronisation avec le serveur partagé (api.php sur l'hébergement).
// - Chaque modification est enregistrée sur l'appareil (IndexedDB) puis envoyée au serveur (boîte d'envoi persistante).
// - Les modifications des autres sont récupérées régulièrement (par défaut toutes les 10 s, et au retour sur la page).
//   Ce n'est pas du temps réel instantané.
// - Même élément modifié par deux personnes : la modification la plus récente l'emporte, et tous les appareils
//   reprennent la version retenue par le serveur.
// - Sans serveur PHP (fichier ouvert directement, hébergement sans PHP) : mode local.
// - Serveur momentanément injoignable : les modifications sont gardées et envoyées dès son retour.
import { idbGet, idbPut } from './idb';
import { CONFIG } from '../config';

export type SyncStateName = 'local' | 'connecting' | 'synced' | 'pending' | 'offline' | 'auth' | 'error';
export interface SyncInfo {
  mode: 'local' | 'remote';
  /** local : aucune synchronisation ; php : api.php sur l'hébergement ; firebase : Firestore */
  backend: 'local' | 'php' | 'firebase';
  /** compte utilisé pour la synchronisation (Firebase) */
  account?: string;
  state: SyncStateName;
  lastSync: string;
  message: string;
  protectedServer: boolean;
}
export type Change =
  | { k: 'rec'; c: string; id: string; t?: string }
  | { k: 'del'; c: string; id: string; at: string }
  | { k: 'kv'; key: string; t?: string };
export type RemoteItem = { c: string; r?: any; id?: string; del?: boolean; at?: string; t?: string };
export type KvEntry = { v: any; at: string };

interface Meta {
  rev: number;
  outbox: Change[];
  kvAt: Record<string, string>;
  uploaded: Record<string, 1>;
  seeded: boolean;
  /** l'adresse du site a déjà répondu sans serveur PARKX (hébergement sans PHP) */
  noServer?: boolean;
}

export const SYNC_COLLS = ['tasks', 'pcbs', 'photos', 'documents', 'journal', 'places', 'planVersions', 'activity'];
export const SYNC_KV = ['project', 'planConfig', 'led', 'team'];
const FILE_COLLS = ['photos', 'documents'];
const keyOf = (ch: Change) => (ch.k === 'kv' ? 'kv:' + ch.key : ch.c + ':' + ch.id);
const itemKey = (it: RemoteItem) => it.c + ':' + (it.r?.id ?? it.id);
const now = () => new Date().toISOString();
/** Élément réellement modifié après sa création (et pas seulement créé par défaut sur cet appareil). */
export const edited = (r: any) => !!(r && r.createdAt && r.updatedAt && r.updatedAt > r.createdAt);

/** Moteur de synchronisation (serveur PHP ou Firebase) utilisé par le store. */
export interface Engine {
  info: SyncInfo;
  start(): Promise<void>;
  stop(): void;
  isRemote(): boolean;
  queue(ch: Change, persist?: boolean, rec?: any): Change | undefined;
  revert(key: string, prev?: Change): void;
  queueMany(recs: { c: string; r: any }[], dels: { c: string; id: string }[], kvKeys: string[]): void;
  syncNow(): Promise<void>;
  /** Firebase : connexion avec le mot de passe de l'équipe ; renvoie '' si c'est bon, sinon le message d'erreur */
  signIn?(secret: string): Promise<string>;
  signOut?(): Promise<void>;
}

export interface SyncHost {
  getRecord(c: string, id: string): any | undefined;
  allRecords(): { c: string; r: any }[];
  getKV(key: string): any;
  /** Applique des données venant du serveur ; `skip(clé)` indique une modification locale en attente (à ne pas écraser). */
  applyRemote(items: RemoteItem[], kv: Record<string, KvEntry>, skip: (key: string) => boolean): Promise<void>;
  setBlob(c: string, id: string, blob: Blob): Promise<void>;
  missingBlobs(): { c: string; id: string }[];
  removeLocalDemo(): Promise<void>;
  user(): string;
  onInfo(info: SyncInfo): void;
}

class AuthError extends Error {}
class TooLarge extends Error {}

export class SyncEngine implements Engine {
  meta: Meta = { rev: 0, outbox: [], kvAt: {}, uploaded: {}, seeded: false };
  info: SyncInfo = { mode: 'local', backend: 'local', state: 'local', lastSync: '', message: '', protectedServer: false };
  private disabled = false; // aucun serveur PARKX : mode local
  private loaded = false;
  private connected = false;
  private stopped = false;
  private current: Promise<void> | null = null;
  private again = false;
  private wantPull = false;
  private lastPull = 0;
  private lastTry = 0;
  private retryAt = 0;
  private timer = 0;
  private kickTimer = 0;
  private warning = '';
  /** Dernière version enregistrée de chaque élément en attente d'envoi. */
  private latest = new Map<string, any>();
  /** Fichiers introuvables sur le serveur : nouvel essai plus tard. */
  private miss: Record<string, number> = {};

  private onFocus = () => this.wake();
  private onVisible = () => document.visibilityState === 'visible' && this.wake();
  private onOnline = () => this.wake();

  constructor(private host: SyncHost) {}

  private get interval() {
    return CONFIG.serveur.intervalle * 1000;
  }
  private url(params: Record<string, string>) {
    const base = CONFIG.serveur.adresse;
    return base + (base.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
  }
  private code() {
    try {
      return localStorage.getItem('parkx-code') || '';
    } catch {
      return '';
    }
  }
  private set(p: Partial<SyncInfo>) {
    if (this.stopped) return;
    this.info = { ...this.info, ...p };
    this.info.backend = this.info.mode === 'remote' ? 'php' : 'local';
    this.host.onInfo(this.info);
  }
  private async saveMeta() {
    if (this.stopped || !this.loaded || this.disabled) return;
    await idbPut('kv', { id: 'syncMeta', value: this.meta });
  }
  private isPending(key: string) {
    return this.meta.outbox.some((x) => keyOf(x) === key);
  }

  private async request(params: Record<string, string>, init: RequestInit = {}, allow404 = false): Promise<Response> {
    const headers: Record<string, string> = { 'X-Parkx': '1', ...((init.headers as Record<string, string>) || {}) };
    const code = this.code();
    if (code) headers['X-Parkx-Code'] = code;
    let res: Response;
    try {
      res = await fetch(this.url(params), { cache: 'no-store', ...init, headers });
    } catch {
      throw new TypeError('hors ligne');
    }
    if (res.status === 401) throw new AuthError('Code d’accès requis');
    if (res.status === 413) {
      let msg = '';
      try {
        msg = (await res.json()).error || '';
      } catch {
        /* réponse non JSON */
      }
      throw new TooLarge(msg || 'Fichier trop volumineux pour le serveur');
    }
    if (!res.ok && !(allow404 && res.status === 404)) {
      let msg = '';
      try {
        msg = (await res.json()).error || '';
      } catch {
        /* réponse non JSON */
      }
      throw new Error(msg || 'Erreur du serveur (' + res.status + ')');
    }
    return res;
  }
  private async getJSON(params: Record<string, string>) {
    const r = await this.request(params);
    try {
      return await r.json();
    } catch {
      throw new Error('Réponse du serveur illisible.');
    }
  }

  private fail(e: unknown) {
    if (e instanceof AuthError) this.set({ mode: 'remote', state: 'auth', message: 'Code d’accès de l’équipe requis.' });
    else if (e instanceof TypeError || !navigator.onLine)
      this.set({ mode: 'remote', state: 'offline', message: 'Pas de connexion au serveur : les modifications sont gardées sur cet appareil et seront envoyées dès que possible.' });
    else this.set({ mode: 'remote', state: 'error', message: (e as Error)?.message || String(e) });
  }

  // ------------------------------------------------------------------
  async start() {
    if (!CONFIG.serveur.actif || !/^https?:$/.test(location.protocol)) {
      this.disabled = true;
      this.set({ mode: 'local', state: 'local', message: 'Données enregistrées dans ce navigateur.' });
      return;
    }
    const early = this.meta; // modifications faites pendant le chargement
    const m = await idbGet<{ id: string; value: Meta }>('kv', 'syncMeta').catch(() => undefined);
    this.meta = { rev: 0, outbox: [], kvAt: {}, uploaded: {}, seeded: false, ...(m?.value || {}) };
    for (const ch of early.outbox) {
      const k = keyOf(ch);
      this.meta.outbox = [...this.meta.outbox.filter((x) => keyOf(x) !== k), ch];
    }
    Object.assign(this.meta.kvAt, early.kvAt);
    this.loaded = true;
    if (this.stopped) return;
    if (early.outbox.length) await this.saveMeta();
    // Tant qu'un serveur PARKX n'a jamais répondu à cet appareil, aucune synchronisation n'est annoncée
    if (this.meta.seeded) this.set({ mode: 'remote', state: 'connecting', message: 'Connexion au serveur…' });
    else this.set({ mode: 'local', state: 'local', message: 'Recherche d’un serveur PARKX (api.php)…' });
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onOnline);
    this.timer = window.setInterval(() => this.tick(), 2000);
    await this.cycle(true);
  }

  stop() {
    this.stopped = true;
    window.clearInterval(this.timer);
    window.clearTimeout(this.kickTimer);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onOnline);
  }

  isRemote() {
    return !this.disabled && this.info.mode === 'remote';
  }

  private wake() {
    this.retryAt = 0;
    this.cycle(true);
  }

  private tick() {
    if (this.stopped || this.disabled || Date.now() < this.retryAt) return;
    if (!this.connected) {
      if (Date.now() - this.lastTry >= this.interval) this.cycle(true);
      return;
    }
    if (this.meta.outbox.length || Date.now() - this.lastPull >= this.interval) this.cycle();
  }

  private kick() {
    if (this.kickTimer || this.disabled) return;
    this.kickTimer = window.setTimeout(() => {
      this.kickTimer = 0;
      if (this.connected && Date.now() >= this.retryAt) this.cycle();
    }, 400);
  }

  /** Une seule opération réseau à la fois : connexion, envoi puis récupération. */
  private cycle(pull = false): Promise<void> {
    if (this.disabled || this.stopped || !this.loaded) return Promise.resolve();
    if (pull) this.wantPull = true;
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.current = (async () => {
      try {
        do {
          this.again = false;
          if (!this.connected) {
            await this.connect();
            if (!this.connected) return;
          }
          await this.push();
          if (this.wantPull || Date.now() - this.lastPull >= this.interval) {
            this.wantPull = false;
            await this.pull();
          }
        } while (this.again && !this.stopped);
        this.retryAt = 0;
        this.set({ mode: 'remote', state: this.meta.outbox.length ? 'pending' : 'synced', lastSync: now(), message: this.warning });
      } catch (e) {
        this.fail(e);
        this.retryAt = Date.now() + (e instanceof AuthError ? 15000 : 5000);
      } finally {
        this.current = null;
      }
    })();
    return this.current;
  }

  private async connect() {
    this.lastTry = Date.now();
    let r: Response;
    try {
      r = await fetch(this.url({ a: 'ping' }), { cache: 'no-store' });
    } catch {
      // Pas de réseau. Si cet appareil n'a jamais utilisé de serveur PARKX, il n'y a aucune synchronisation
      // à annoncer : PARKX fonctionne en local (nouvelle recherche du serveur au retour de la connexion).
      if (!this.meta.seeded) {
        this.set({ mode: 'local', state: 'local', message: this.meta.noServer ? 'Aucun serveur PARKX (api.php) : données enregistrées dans ce navigateur uniquement.' : 'Pas de connexion : données enregistrées dans ce navigateur.' });
        return;
      }
      throw new TypeError('hors ligne');
    }
    let j: any = null;
    try {
      j = await r.json();
    } catch {
      j = null;
    }
    if (j && j.app === 'PARKX') {
      this.meta.noServer = false;
      this.info.protectedServer = !!j.protected;
      if (j.stockage === false) throw new Error('Le dossier « donnees » ne peut pas être créé sur l’hébergement : donnez les droits d’écriture (755 ou 775) au dossier du site.');
      this.set({ mode: 'remote' });
      if (!this.meta.seeded) await this.reconcile();
      this.connected = true;
      return;
    }
    if (r.status >= 500) throw new Error('Erreur du serveur (' + r.status + ')');
    // Le site répond mais sans serveur PARKX (PHP absent, api.php manquant…)
    if (this.meta.seeded) throw new Error('Serveur PARKX (api.php) introuvable : les modifications restent sur cet appareil et seront envoyées à son retour.');
    this.meta.outbox = [];
    this.meta.noServer = true;
    await this.saveMeta();
    this.disabled = true;
    this.latest.clear();
    this.set({ mode: 'local', state: 'local', message: 'Aucun serveur PARKX (api.php) : données enregistrées dans ce navigateur uniquement.' });
  }

  /**
   * Première connexion de cet appareil (ou serveur remis à zéro) : le serveur fait foi pour ce qu'il contient,
   * sauf les éléments modifiés ici plus récemment ; ce qui n'existe que sur cet appareil lui est envoyé.
   */
  private async reconcile() {
    await this.host.removeLocalDemo();
    const j = await this.getJSON({ a: 'pull', since: '0' });
    if (this.stopped) return;
    this.lastPull = Date.now();
    const onServer = new Set<string>();
    const apply: RemoteItem[] = [];
    for (const it of (j.items || []) as RemoteItem[]) {
      const key = itemKey(it);
      onServer.add(key);
      if (this.isPending(key)) continue;
      const id = (it.r?.id ?? it.id) as string;
      const local = this.host.getRecord(it.c, id);
      if (local && !local.demo && edited(local) && local.updatedAt > (it.t || '')) {
        this.queue({ k: 'rec', c: it.c, id, t: local.updatedAt }, false);
        continue;
      }
      apply.push(it);
    }
    const kv: Record<string, KvEntry> = {};
    let team: KvEntry | null = null;
    for (const [k, e] of Object.entries((j.kv || {}) as Record<string, KvEntry>)) {
      onServer.add('kv:' + k);
      if (this.isPending('kv:' + k)) {
        // Nouvel arrivant : son nom s'ajoute à l'équipe existante sans en retirer personne
        if (k === 'team' && Array.isArray(e.v)) team = { v: Array.from(new Set([...e.v, ...((this.host.getKV('team') as string[]) || [])])), at: this.meta.kvAt.team || now() };
        continue;
      }
      kv[k] = e;
      this.meta.kvAt[k] = e.at;
    }
    for (const it of apply) if (it.r && FILE_COLLS.includes(it.c)) this.meta.uploaded[it.r.id] = 1;
    await this.host.applyRemote(apply, kv, (key) => this.isPending(key));
    if (team) {
      this.latest.set('kv:team', team.v);
      await this.host.applyRemote([], { team }, () => false);
    }
    if (this.stopped) return;
    // Ce qui n'existe que sur cet appareil est envoyé au serveur
    for (const { c, r } of this.host.allRecords()) if (!r.demo && !onServer.has(c + ':' + r.id)) this.queue({ k: 'rec', c, id: r.id, t: r.updatedAt || r.at || now() }, false);
    for (const key of SYNC_KV) if (!onServer.has('kv:' + key) && this.host.getKV(key) !== undefined) this.queue({ k: 'kv', key, t: this.meta.kvAt[key] || now() }, false);
    this.meta.rev = j.rev || 0;
    this.meta.seeded = true;
    await this.saveMeta();
    await this.downloadBlobs();
  }

  // ------------------------------------------------------------------
  /** Ajoute une modification locale à la boîte d'envoi. */
  queue(ch: Change, persist = true, rec?: any): Change | undefined {
    if (this.disabled || this.stopped) return undefined;
    if (ch.k === 'kv') {
      ch = { ...ch, t: ch.t || now() };
      this.meta.kvAt[ch.key] = ch.t!;
    } else if (ch.k === 'rec') ch = { ...ch, t: ch.t || now() };
    const k = keyOf(ch);
    const prev = this.meta.outbox.find((x) => keyOf(x) === k);
    if (ch.k !== 'del' && rec !== undefined) this.latest.set(k, rec);
    else this.latest.delete(k);
    this.meta.outbox = [...this.meta.outbox.filter((x) => keyOf(x) !== k), ch];
    if (persist) this.saveMeta();
    if (this.info.mode === 'remote' && this.info.state === 'synced') this.set({ state: 'pending' });
    this.kick();
    return prev;
  }

  /** L'écriture locale a échoué : la modification ne doit pas partir vers le serveur. */
  revert(key: string, prev?: Change) {
    if (this.disabled || this.stopped) return;
    this.meta.outbox = this.meta.outbox.filter((x) => keyOf(x) !== key);
    this.latest.delete(key);
    if (prev) this.meta.outbox.push(prev);
    this.saveMeta();
  }

  /** Import ou restauration : ces éléments deviennent la version la plus récente pour toute l'équipe. */
  queueMany(recs: { c: string; r: any }[], dels: { c: string; id: string }[], kvKeys: string[]) {
    if (this.disabled || this.stopped) return;
    const t = now();
    for (const { c, r } of recs) if (r && !r.demo) this.queue({ k: 'rec', c, id: r.id, t }, false, r);
    for (const { c, id } of dels) this.queue({ k: 'del', c, id, at: t }, false);
    for (const key of kvKeys) this.queue({ k: 'kv', key, t }, false);
    this.saveMeta();
  }

  async syncNow() {
    if (this.disabled) return;
    this.retryAt = 0;
    await this.cycle(true);
    if (this.again || this.current) await this.cycle(true);
  }

  private recordFor(ch: Change) {
    if (ch.k !== 'rec') return undefined;
    return this.latest.get(keyOf(ch)) ?? this.host.getRecord(ch.c, ch.id);
  }

  private async push() {
    while (this.meta.outbox.length && !this.stopped) {
      const batch = this.meta.outbox.slice(0, 100);
      // 1) photos et documents : le fichier part avant sa fiche
      for (const ch of batch) {
        if (ch.k !== 'rec' || !FILE_COLLS.includes(ch.c) || this.meta.uploaded[ch.id]) continue;
        const r = this.recordFor(ch);
        if (!r?.blob || !r.blob.size) continue;
        try {
          await this.request({ a: 'upload', c: ch.c, id: ch.id }, { method: 'POST', headers: { 'Content-Type': r.blob.type || 'application/octet-stream' }, body: r.blob });
        } catch (e) {
          if (!(e instanceof TooLarge)) throw e;
          // Trop lourd pour l'hébergement : la fiche est partagée, le fichier reste sur cet appareil
          this.warning = (e.message || 'Fichier trop volumineux pour le serveur') + ' — « ' + (r.name || r.title || r.caption || ch.id) + ' » reste uniquement sur cet appareil.';
        }
        this.meta.uploaded[ch.id] = 1;
      }
      // 2) fiches et réglages partagés
      const changes: any[] = [];
      const kv: Record<string, KvEntry> = {};
      for (const ch of batch) {
        if (ch.k === 'rec') {
          const r = this.recordFor(ch);
          if (r && !r.demo) {
            const { blob, ...rest } = r;
            changes.push({ c: ch.c, r: rest, t: ch.t || rest.updatedAt || now() });
          }
        } else if (ch.k === 'del') changes.push({ c: ch.c, id: ch.id, del: true, at: ch.at });
        else {
          const k = keyOf(ch);
          const v = this.latest.has(k) ? this.latest.get(k) : this.host.getKV(ch.key);
          if (v !== undefined) kv[ch.key] = { v, at: this.meta.kvAt[ch.key] || ch.t || now() };
        }
      }
      const res = await this.request(
        { a: 'push' },
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes, kv, by: this.host.user() }) }
      );
      let j: any = {};
      try {
        j = await res.json();
      } catch {
        throw new Error('Réponse du serveur illisible.');
      }
      if (this.stopped) return;
      this.meta.outbox = this.meta.outbox.filter((x) => !batch.includes(x));
      const still = new Set(this.meta.outbox.map(keyOf));
      for (const ch of batch) if (!still.has(keyOf(ch))) this.latest.delete(keyOf(ch));
      // Le serveur a gardé une version plus récente (modifiée par quelqu'un d'autre) : on la reprend ici
      const conf: RemoteItem[] = Array.isArray(j.conflicts) ? (j.conflicts as RemoteItem[]).filter((it) => !this.isPending(itemKey(it))) : [];
      const kvc: Record<string, KvEntry> = {};
      for (const [k, e] of Object.entries((j.kvConflicts || {}) as Record<string, KvEntry>)) {
        if (this.isPending('kv:' + k)) continue;
        kvc[k] = e;
        this.meta.kvAt[k] = e.at;
      }
      if (conf.length || Object.keys(kvc).length) await this.host.applyRemote(conf, kvc, (key) => this.isPending(key));
      await this.saveMeta();
    }
  }

  private async pull() {
    this.lastPull = Date.now();
    const j = await this.getJSON({ a: 'pull', since: String(this.meta.rev) });
    if (this.stopped) return;
    if (typeof j.rev === 'number' && j.rev < this.meta.rev) {
      // Données du serveur remplacées ou effacées : réconciliation complète (rien n'est perdu sur cet appareil)
      await this.reconcile();
      return;
    }
    const items = ((j.items || []) as RemoteItem[]).filter((it) => !this.isPending(itemKey(it)));
    const kv: Record<string, KvEntry> = {};
    for (const [k, e] of Object.entries((j.kv || {}) as Record<string, KvEntry>)) {
      if (this.isPending('kv:' + k)) continue;
      kv[k] = e;
      this.meta.kvAt[k] = e.at;
    }
    for (const it of items) if (it.r && FILE_COLLS.includes(it.c)) this.meta.uploaded[it.r.id] = 1;
    if (items.length || Object.keys(kv).length) await this.host.applyRemote(items, kv, (key) => this.isPending(key));
    this.meta.rev = j.rev || 0;
    await this.saveMeta();
    await this.downloadBlobs();
  }

  /** Photos et documents des autres : téléchargés progressivement. */
  private async downloadBlobs() {
    const t = Date.now();
    const list = this.host.missingBlobs().filter(({ id }) => this.meta.uploaded[id] && !((this.miss[id] || 0) > t));
    for (const { c, id } of list.slice(0, 12)) {
      if (this.stopped) return;
      const r = await this.request({ a: 'file', id }, {}, true);
      if (r.ok) await this.host.setBlob(c, id, await r.blob());
      else this.miss[id] = t + 10 * 60 * 1000;
    }
  }
}
