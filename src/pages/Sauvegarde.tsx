// Page « Sauvegarde » : état réel de l'enregistrement, export, restauration, date de la dernière sauvegarde,
// export automatique, points de restauration et réinitialisation (avec confirmation explicite).
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import type { Snapshot } from '../db/types';
import { Badge, Btn, Field, Modal, Section, useShowMore, useUI } from '../components/ui';
import { COLL_LABELS, buildBackup, parseBackup, type ParsedImport } from '../db/backup';
import { chooseExportFile, fsSupported, getHandle, handlePermission, runExport } from '../lib/autoexport';
import { downloadBlob, fmtDate, fmtDateTime, fmtSize, nowISO, stamp } from '../lib/utils';
import { storageEstimate } from '../db/idb';
import { Icon } from '../components/Icons';

const DAY = 86400000;

export default function Sauvegarde(_props: { go?: unknown; param?: string }) {
  const store = useStore();
  const { data, setKV, user, sync, saveInfo, storage } = store;
  const { toast, confirm } = useUI();
  const s = data.kv.settings;
  const bi = data.kv.backupInfo;
  const si = data.kv.storageInfo;
  const [busy, setBusy] = useState('');
  const [imp, setImp] = useState<(ParsedImport & { fileName: string }) | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [strategy, setStrategy] = useState<'recent' | 'local' | 'import'>('recent');
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [handleName, setHandleName] = useState('');
  const [perm, setPerm] = useState('');
  const [usage, setUsage] = useState('');
  const [resetTxt, setResetTxt] = useState('');
  const [resetDemo, setResetDemo] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const snapList = useShowMore(snaps, 5);
  const remote = sync.mode === 'remote';

  const refreshSnaps = () => store.listSnapshots().then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => {
    refreshSnaps();
    getHandle().then(async (h) => {
      if (h) {
        setHandleName(h.name);
        setPerm(await handlePermission(h, false).catch(() => 'denied'));
      }
    });
    storageEstimate().then((e) => e && setUsage(`${fmtSize(e.usage)} utilisés${e.quota ? ' sur ' + fmtSize(e.quota) + ' disponibles' : ''}`));
  }, []);

  const setSettings = (patch: Partial<typeof s>, label?: string) => setKV('settings', { ...s, ...patch }, label);
  const setAE = (patch: Partial<typeof s.autoExport>) => setSettings({ autoExport: { ...s.autoExport, ...patch } }, 'Export automatique mis à jour');

  const exportNow = async (files = true) => {
    setBusy('export');
    try {
      const b = await buildBackup(data, user, files);
      const name = `parkx-${files ? 'sauvegarde' : 'donnees'}-${stamp()}.json`;
      downloadBlob(new Blob([JSON.stringify(b, null, files ? 0 : 1)], { type: 'application/json' }), name);
      await store.log('export', 'Sauvegarde', files ? 'Export complet (avec photos et documents)' : 'Export des données (sans fichiers)');
      await store.markBackup({ lastExportAt: nowISO(), lastExportName: name, lastExportKind: files ? 'complète' : 'données seules' }).catch(() => undefined);
      toast('Sauvegarde exportée : « ' + name + ' » (dossier Téléchargements). Conservez ce fichier en lieu sûr.');
    } catch (e: any) {
      toast('Échec de l’export : ' + (e?.message || e), 'err');
    }
    setBusy('');
  };

  const onFile = async (f: File) => {
    try {
      const p = parseBackup(await f.text());
      setImp({ ...p, fileName: f.name });
      setMode('merge');
      setStrategy('recent');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };

  const doImport = async () => {
    if (!imp) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Remplacer toutes les données ?',
        danger: true,
        confirm: 'Remplacer mes données',
        text: remote ? (
          <>Les données du projet seront <b>remplacées pour toute l'équipe</b> par celles du fichier : les éléments absents du fichier seront supprimés sur tous les appareils. Un point de restauration (hors photos et documents) est créé automatiquement et le serveur garde une copie par jour, mais exportez d'abord une sauvegarde complète.</>
        ) : (
          <>Les données actuelles de ce navigateur seront <b>remplacées</b> par celles du fichier. Un point de restauration (hors photos et documents) est créé automatiquement, mais exportez d'abord une sauvegarde complète.</>
        ),
      });
      if (!ok) return;
    }
    setBusy('import');
    try {
      const r = await store.applyBackup(imp.backup, mode, strategy);
      await store.markBackup({ lastImportAt: nowISO(), lastImportName: imp.fileName }).catch(() => undefined);
      toast(mode === 'replace' ? 'Données remplacées par la sauvegarde.' : `Restauration terminée : ${r.added} ajout(s), ${r.updated} mise(s) à jour, ${r.conflicts} conflit(s) traité(s).`);
      setImp(null);
      refreshSnaps();
    } catch (e: any) {
      toast('Restauration impossible : ' + (e?.message || e), 'err');
    }
    setBusy('');
  };

  // ---------- État de l'enregistrement ----------
  const memory = storage.mode === 'memory';
  const failed = !memory && saveInfo.state === 'error';
  const tone = memory || failed ? 'red' : 'green';
  const headline = memory
    ? "Rien n'est enregistré dans ce navigateur"
    : failed
      ? "La dernière modification n'a pas été enregistrée"
      : remote
        ? 'Données enregistrées et partagées avec l’équipe'
        : 'Toutes vos données sont enregistrées dans ce navigateur (local uniquement)';
  const sub = memory
    ? `Le navigateur interdit l'enregistrement ici (${storage.reason}). Ouvrez PARKX par double-clic sur index.html (ou PARKX.html) dans Chrome ou Edge, hors navigation privée, ou utilisez le site en ligne. En attendant, exportez une sauvegarde avant de fermer.`
    : failed
      ? `${saveInfo.error}. L'écran n'affiche que ce qui est réellement enregistré : recommencez la modification.`
      : 'Chaque modification est enregistrée automatiquement et immédiatement. Tout reste après la fermeture de la page, du navigateur ou l’arrêt de l’ordinateur.' +
        (remote ? (sync.backend === 'firebase' ? ' Elles sont aussi synchronisées avec Firebase pour toute l’équipe.' : ' Une copie est aussi envoyée sur le serveur de l’équipe.') : '');
  const lastExportAge = bi.lastExportAt ? Date.now() - new Date(bi.lastExportAt).getTime() : Infinity;
  const total = Object.keys(COLL_LABELS).reduce((n, k) => n + (data as any)[k].length, 0);
  const demoCount = ['tasks', 'journal', 'photos', 'documents'].reduce((n, k) => n + (data as any)[k].filter((x: any) => x.demo).length, 0);
  const syncLabel: Record<string, string> = {
    synced: 'Synchronisé',
    pending: 'Synchronisation en cours',
    connecting: 'Synchronisation en cours',
    offline: 'Hors ligne',
    auth: sync.backend === 'firebase' ? 'Connexion requise' : 'Code requis',
    error: 'Erreur de synchronisation',
    local: 'Local uniquement',
  };

  return (
    <PageShell title="Sauvegarde" icon="shield">
      <Card className="save-status">
        <div className={'ss-main t-' + tone}>
          <span className="ss-ic"><Icon name={tone === 'green' ? 'check' : 'alert'} size={24} /></span>
          <div>
            <h3>{headline}</h3>
            <p>{sub}</p>
          </div>
        </div>
        <div className="ss-facts">
          <div>
            <span>Dernier enregistrement</span>
            <b>{memory ? '—' : saveInfo.at ? fmtDateTime(saveInfo.at) : si.lastOpenAt ? 'à l’ouverture, ' + fmtDateTime(si.lastOpenAt) : '—'}</b>
          </div>
          <div>
            <span>Dernière sauvegarde sur fichier</span>
            <b className={lastExportAge > 7 * DAY ? 'late' : ''}>{bi.lastExportAt ? fmtDateTime(bi.lastExportAt) : 'Jamais'}</b>
            {bi.lastExportAt && <small>{bi.lastExportKind}{bi.lastExportName ? ' — ' + bi.lastExportName : ''}</small>}
          </div>
          <div>
            <span>Données conservées ici depuis</span>
            <b>{memory ? '—' : fmtDate(si.installedAt)}</b>
            {!memory && si.opens > 1 && <small>{si.opens} ouvertures de PARKX</small>}
          </div>
        </div>
        {!memory && lastExportAge > 7 * DAY && (
          <div className="notice warn slim m">
            <Icon name="info" size={15} />
            <span>{bi.lastExportAt ? 'Votre dernière sauvegarde sur fichier date de plus de 7 jours.' : 'Aucune sauvegarde sur fichier pour le moment.'} Exportez-en une : elle protège le projet si le navigateur est effacé ou si vous changez d’ordinateur.</span>
          </div>
        )}
      </Card>

      <div className="grid g-2 save-actions">
        <button className="big-action is-primary" disabled={!!busy} onClick={() => exportNow(true)}>
          <Icon name="download" size={22} />
          <span>
            <b>{busy === 'export' ? 'Export en cours…' : 'Exporter une sauvegarde'}</b>
            <small>Un fichier .json avec tout le projet, photos et documents compris</small>
          </span>
        </button>
        <button className="big-action" disabled={!!busy} onClick={() => fileIn.current?.click()}>
          <Icon name="upload" size={22} />
          <span>
            <b>Restaurer une sauvegarde</b>
            <small>Choisir un fichier .json : il est vérifié avant toute modification</small>
          </span>
        </button>
        <input ref={fileIn} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </div>
      {bi.lastImportAt && <p className="muted small">Dernière restauration : {fmtDateTime(bi.lastImportAt)}{bi.lastImportName ? ' — ' + bi.lastImportName : ''}</p>}

      <Section
        title="Synchronisation entre ordinateurs"
        icon="layers"
        summary={remote ? syncLabel[sync.state] : 'Non configurée : local uniquement'}
        defaultOpen={!remote || (sync.state !== 'synced' && sync.state !== 'pending')}
      >
        {!remote ? (
          <p className="small">
            <b>PARKX fonctionne uniquement en local</b> : les données sont enregistrées dans ce navigateur, sur cet ordinateur. Pour retrouver les mêmes données sur plusieurs ordinateurs, configurez Firebase dans <b>reglages.js</b> (voir le guide <b>FIREBASE.txt</b>), ou installez le site sur un hébergement avec PHP (voir <b>INSTALLATION-FTP.txt</b>).
          </p>
        ) : (
          <>
            <div className="server-row">
              <Badge tone={sync.state === 'synced' ? 'green' : sync.state === 'pending' || sync.state === 'connecting' ? 'blue' : sync.state === 'error' ? 'red' : 'orange'}>{syncLabel[sync.state]}</Badge>
              <span className="muted small">{(sync.state === 'synced' || sync.state === 'pending') && sync.lastSync ? 'Dernière synchronisation : ' + fmtDateTime(sync.lastSync) : sync.state === 'synced' || sync.state === 'pending' ? '' : sync.message}</span>
              <Btn small icon="restore" onClick={() => store.syncNow()}>Synchroniser maintenant</Btn>
            </div>
            {sync.state === 'synced' && sync.message && <div className="notice warn slim m">{sync.message}</div>}
            {sync.backend === 'firebase' ? (
              <p className="muted small">Synchronisation <b>Firebase</b> : vos modifications partent aussitôt et apparaissent en quelques secondes sur les autres ordinateurs connectés. Hors connexion, elles restent sur cet appareil et partent au retour du réseau. Si deux personnes modifient la même information, la modification la plus récente l’emporte. Une restauration ou un remplacement s’applique à toute l’équipe.</p>
            ) : (
              <p className="muted small">Vos modifications partent aussitôt vers le serveur ; celles des autres arrivent automatiquement (vérification toutes les {CONFIG.serveur.intervalle} s et à chaque retour sur la page) : ce n’est pas du temps réel instantané. Une restauration ou un remplacement s’applique à toute l’équipe.</p>
            )}
            {sync.backend === 'firebase' && (
              <div className="server-row">
                <span className="small">Compte d’équipe : <b>{sync.account || '—'}</b>{sync.state === 'auth' ? ' (cet ordinateur n’est pas connecté)' : ''}</span>
                {sync.state !== 'auth' && (
                  <Btn small kind="ghost" icon="x" onClick={async () => { if (await confirm({ title: 'Déconnecter cet ordinateur ?', text: 'La synchronisation s’arrête sur cet ordinateur jusqu’à la prochaine saisie du mot de passe de l’équipe. Les données restent enregistrées ici.', confirm: 'Déconnecter' })) { await store.signOutSync(); toast('Ordinateur déconnecté du projet partagé.'); } }}>Se déconnecter de cet ordinateur</Btn>
                )}
              </div>
            )}
            {((sync.backend === 'php' && (sync.protectedServer || sync.state === 'auth')) || (sync.backend === 'firebase' && sync.state === 'auth')) && (
              <div className="inline-form">
                <input type="password" placeholder={sync.backend === 'firebase' ? "Mot de passe de l'équipe" : "Code d'accès de l'équipe"} value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
                <Btn icon="check" disabled={!codeInput.trim()} onClick={async () => { const err = await store.setAccessCode(codeInput); setCodeInput(''); toast(err || (sync.backend === 'firebase' ? 'Connecté au projet partagé.' : 'Code enregistré sur cet appareil.'), err ? 'err' : 'ok'); }}>{sync.backend === 'firebase' ? 'Se connecter' : 'Enregistrer le code'}</Btn>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Export automatique" icon="clock" summary={s.autoExport.enabled ? `Toutes les ${s.autoExport.intervalMin} min` : 'Désactivé'}>
        <label className="switch">
          <input type="checkbox" checked={s.autoExport.enabled} onChange={(e) => setAE({ enabled: e.target.checked })} />
          <span /> Exporter automatiquement une sauvegarde
        </label>
        <div className="form-grid">
          <Field label="Mode">
            <select value={s.autoExport.mode} onChange={(e) => setAE({ mode: e.target.value as any })}>
              <option value="download">Télécharger un fichier daté</option>
              <option value="file" disabled={!fsSupported()}>Réécrire un fichier choisi{fsSupported() ? '' : ' (non pris en charge ici)'}</option>
            </select>
          </Field>
          <Field label="Fréquence">
            <select value={s.autoExport.intervalMin} onChange={(e) => setAE({ intervalMin: Number(e.target.value) })}>
              {[5, 15, 30, 60, 120].map((m) => <option key={m} value={m}>Toutes les {m} min</option>)}
            </select>
          </Field>
        </div>
        {s.autoExport.mode === 'file' && (
          <div className="file-target">
            <span><Icon name="file" size={14} /> {handleName ? <b>{handleName}</b> : 'Aucun fichier choisi'} {handleName && <Badge tone={perm === 'granted' ? 'green' : 'orange'}>{perm === 'granted' ? 'Autorisé' : 'Autorisation à renouveler'}</Badge>}</span>
            <Btn small icon="folder" onClick={async () => { try { const n = await chooseExportFile(); setHandleName(n); setPerm('granted'); toast('Fichier de destination enregistré.'); } catch (e: any) { if (e?.name !== 'AbortError') toast('Choix du fichier impossible : ' + e.message, 'err'); } }}>Choisir le fichier</Btn>
          </div>
        )}
        <p className="muted small">
          Un export n'est produit que si des modifications ont eu lieu depuis le précédent, tant que PARKX est ouvert. Dernier export automatique : <b>{s.autoExport.lastAt ? fmtDateTime(s.autoExport.lastAt) : 'jamais'}</b>.
          {s.autoExport.mode === 'download' ? ' Les fichiers arrivent dans le dossier Téléchargements.' : ' Après réouverture du navigateur, cliquez sur « Exporter maintenant » pour renouveler l’autorisation.'}
        </p>
        <Btn
          icon="download"
          onClick={async () => {
            try {
              const r = await runExport(data, user, s.autoExport.mode, true);
              if (r.ok) {
                const at = nowISO();
                await setAE({ lastAt: at });
                await store.markBackup({ lastExportAt: at, lastExportName: r.name || '', lastExportKind: 'automatique' }).catch(() => undefined);
                setPerm('granted');
              }
              toast(r.msg, r.ok ? 'ok' : 'err');
            } catch (e: any) {
              toast('Export impossible : ' + (e?.message || e), 'err');
            }
          }}
        >
          Exporter maintenant
        </Btn>
      </Section>

      <Section
        title="Points de restauration"
        icon="history"
        summary={snaps.length ? `${snaps.length} instantané${snaps.length > 1 ? 's' : ''}` : 'Aucun'}
        actions={<Btn small icon="plus" onClick={async () => { await store.takeSnapshot('Instantané manuel'); refreshSnaps(); toast('Point de restauration créé.'); }}>Créer</Btn>}
      >
        <label className="switch">
          <input type="checkbox" checked={s.autoSnapshot} onChange={(e) => setSettings({ autoSnapshot: e.target.checked })} />
          <span /> Point de restauration automatique toutes les 10 minutes (en cas de modification)
        </label>
        <p className="muted small">Copies internes au navigateur (20 dernières, hors photos et documents), créées aussi avant chaque restauration ou réinitialisation.</p>
        {snaps.length === 0 ? (
          <p className="muted">Aucun point de restauration pour le moment.</p>
        ) : (
          <ul className="snap-list">
            {snapList.visible.map((sn) => (
              <li key={sn.id}>
                <div>
                  <b>{fmtDateTime(sn.at)}</b>
                  <span className="muted small">{sn.reason} · {sn.author} · {fmtSize(sn.payload.length)}</span>
                </div>
                <Btn small icon="restore" onClick={async () => { if (await confirm({ title: 'Revenir à ce point de restauration ?', text: <>Les données (hors photos et documents) reviendront à leur état du <b>{fmtDateTime(sn.at)}</b>{remote ? <>, <b>pour toute l'équipe</b></> : ''}. L'état actuel est d'abord gardé dans un nouveau point de restauration.</>, confirm: 'Restaurer' })) { await store.restoreSnapshot(sn); refreshSnaps(); toast('Point de restauration appliqué.'); } }}>Restaurer</Btn>
                <Btn small kind="ghost" icon="trash" aria-label="Supprimer ce point de restauration" onClick={async () => { if (await confirm({ title: 'Supprimer ce point de restauration ?', text: 'Cette copie interne sera supprimée. Vos données actuelles ne changent pas.', danger: true, confirm: 'Supprimer' })) { await store.deleteSnapshot(sn.id); refreshSnaps(); } }} />
              </li>
            ))}
          </ul>
        )}
        {snapList.control}
      </Section>

      <Section title="Contenu enregistré dans ce navigateur" icon="layers" summary={`${total} éléments${usage ? ' · ' + usage.split(' sur ')[0] : ''}`}>
        <div className="grid g-2">
          <table className="table compact">
            <tbody>
              {Object.entries(COLL_LABELS).map(([k, l]) => <tr key={k}><td>{l}</td><td className="num"><b>{(data as any)[k].length}</b></td></tr>)}
              <tr><td>Historique des modifications</td><td className="num"><b>{data.activity.length}</b></td></tr>
              <tr><td>Espace utilisé</td><td className="num">{usage || '—'}</td></tr>
            </tbody>
          </table>
          <div className="stack">
            <p className="small">
              <b>Protection contre l’effacement automatique :</b>{' '}
              {storage.persisted === true ? 'activée — le navigateur ne supprimera pas ces données pour faire de la place.' : storage.persisted === false ? 'non garantie — si le disque est presque plein, le navigateur peut effacer ces données.' : 'non disponible dans ce navigateur.'}
            </p>
            {storage.persisted === false && <Btn small icon="shield" onClick={async () => { const p = await store.askPersist(); toast(p ? 'Protection activée.' : 'Le navigateur a refusé : gardez des sauvegardes sur fichier.', p ? 'ok' : 'err'); }}>Demander la protection</Btn>}
            <details className="more">
              <summary>Quand les données peuvent-elles disparaître ?</summary>
              <ul className="small tight">
                <li>si l’on efface les données de navigation (historique, cookies et données de sites) ;</li>
                <li>en navigation privée : tout est effacé à la fermeture de la fenêtre ;</li>
                <li>dans un autre navigateur, sur un autre ordinateur ou depuis une autre adresse (fichier ou site en ligne), les données ne sont pas les mêmes ;</li>
                <li>avec Firefox, si le dossier PARKX est déplacé ou ouvert sans être décompressé.</li>
              </ul>
              <p className="small">Dans tous ces cas, une sauvegarde sur fichier permet de tout retrouver.</p>
            </details>
            <Btn small icon="file" disabled={!!busy} onClick={() => exportNow(false)}>Exporter les données seules (sans photos ni documents)</Btn>
            <Btn small icon="trash" disabled={!demoCount} onClick={async () => { if (await confirm({ title: 'Supprimer les exemples de démonstration ?', text: `${demoCount} élément(s) marqué(s) « DÉMO » seront supprimés. Vos propres données ne sont pas touchées.`, danger: true, confirm: 'Supprimer la démo' })) { const n = await store.removeDemo(); toast(`${n} exemple(s) de démonstration supprimé(s).`); } }}>Supprimer les exemples de démo ({demoCount})</Btn>
          </div>
        </div>
      </Section>

      <Section title="Réinitialiser les données" icon="alert" summary="Confirmation obligatoire" className="danger-zone no-print">
        <p className="muted small">
          {remote
            ? 'Efface les données de ce navigateur uniquement. Les données de l’équipe restent sur le serveur et sont rechargées automatiquement.'
            : 'Efface toutes les données de ce navigateur et repart d’un projet vide. Exportez une sauvegarde avant. PARKX n’efface jamais rien automatiquement.'}
        </p>
        <Btn kind="danger" icon="trash" onClick={() => { setResetTxt(''); setResetDemo(false); setResetOpen(true); }}>Réinitialiser l'application…</Btn>
      </Section>

      {imp && (
        <Modal
          wide
          title="Restaurer une sauvegarde"
          icon="upload"
          onClose={() => setImp(null)}
          footer={
            <>
              <Btn onClick={() => exportNow(true)} icon="download" className="mr-auto">Exporter d'abord mes données</Btn>
              <Btn onClick={() => setImp(null)}>Annuler</Btn>
              <Btn kind={mode === 'replace' ? 'danger' : 'primary'} icon="upload" disabled={busy === 'import'} onClick={doImport}>{busy === 'import' ? 'Restauration…' : mode === 'replace' ? 'Remplacer' : 'Fusionner'}</Btn>
            </>
          }
        >
          <div className="notice ok m"><Icon name="check" size={15} /> Fichier PARKX valide — « {imp.fileName} », exporté le {fmtDateTime(imp.backup.exportedAt)} par <b>{imp.backup.exportedBy || '?'}</b> ({imp.backup.kind}).</div>
          {imp.warnings.map((w) => <div key={w} className="notice warn m">{w}</div>)}
          <div className="radio-cards">
            <label className={mode === 'merge' ? 'on' : ''}>
              <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <b>Fusionner</b>
              <small>Ajoute ce qui manque et garde vos données. Recommandé.</small>
            </label>
            <label className={mode === 'replace' ? 'on danger' : ''}>
              <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <b>Remplacer tout</b>
              <small>Les données actuelles sont remplacées par celles du fichier.</small>
            </label>
          </div>
          {mode === 'merge' && (
            <Field label="Si un même élément a été modifié des deux côtés" full>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as any)}>
                <option value="recent">Garder la version la plus récente</option>
                <option value="local">Garder ma version</option>
                <option value="import">Garder la version du fichier</option>
              </select>
            </Field>
          )}
          <details className="more">
            <summary>Détail du contenu du fichier</summary>
            <table className="table compact">
              <thead><tr><th>Contenu</th><th className="num">Dans le fichier</th><th className="num">Actuellement</th><th className="num">Identiques / différents</th></tr></thead>
              <tbody>
                {Object.entries(imp.counts).map(([k, n]) => {
                  const local = (data as any)[k] as any[];
                  const inc = imp.backup.data[k] || [];
                  const both = inc.filter((x: any) => local.some((l) => l.id === x.id));
                  const conf = both.filter((x: any) => local.find((l) => l.id === x.id)?.updatedAt !== x.updatedAt).length;
                  return <tr key={k}><td>{COLL_LABELS[k]}</td><td className="num">{n}</td><td className="num">{local.length}</td><td className="num">{both.length - conf} / <b className={conf ? 'late' : ''}>{conf}</b></td></tr>;
                })}
              </tbody>
            </table>
          </details>
        </Modal>
      )}

      {resetOpen && (
        <Modal
          title="Réinitialiser l'application"
          icon="alert"
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <Btn onClick={() => exportNow(true)} icon="download" className="mr-auto">Exporter une sauvegarde</Btn>
              <Btn onClick={() => setResetOpen(false)}>Annuler</Btn>
              <Btn kind="danger" icon="trash" disabled={resetTxt !== 'SUPPRIMER'} onClick={async () => { await store.resetAll(resetDemo); setResetOpen(false); toast('Application réinitialisée.'); }}>Tout effacer</Btn>
            </>
          }
        >
          <p>Toutes les tâches, fiches PCB, photos, documents, entrées du journal et versions du plan de <b>ce navigateur</b> seront effacées.{remote ? " Les données de l'équipe restent sur le serveur et seront rechargées." : ''}</p>
          <label className="check-line"><input type="checkbox" checked={resetDemo} onChange={(e) => setResetDemo(e.target.checked)} /> Recréer les exemples de démonstration</label>
          <Field label="Tapez SUPPRIMER pour confirmer" full><input value={resetTxt} onChange={(e) => setResetTxt(e.target.value)} /></Field>
        </Modal>
      )}
    </PageShell>
  );
}
