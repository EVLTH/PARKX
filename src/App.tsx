import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './db/store';
import { Btn, Field, Modal, UIProvider, useUI } from './components/ui';
import { Sidebar, Topbar, NAV, type Route } from './components/Layout';
import { Logo } from './components/Logo';
import { SIGNATURE } from './db/types';
import { useAutoBackup } from './lib/autoexport';
import Dashboard from './pages/Dashboard';
import Presentation from './pages/Presentation';
import Conception from './pages/Conception';
import Schema from './pages/Schema';
import Simulation3D from './pages/Simulation3D';
import Fabrication from './pages/Fabrication';
import PcbPage from './pages/Pcb';
import Galerie from './pages/Galerie';
import Documents from './pages/Documents';
import Journal from './pages/Journal';
import Parametres from './pages/Parametres';
import Sauvegarde from './pages/Sauvegarde';
import { Icon } from './components/Icons';

function parseHash(): { route: Route; param?: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [r, qs] = h.split('?');
  let route = (NAV.some((n) => n.id === r) ? r : 'dashboard') as Route;
  let param = new URLSearchParams(qs || '').get('id') || undefined;
  // anciens liens : les sauvegardes et les données ont leur propre page
  if (route === 'parametres' && (param === 'sauvegardes' || param === 'donnees')) {
    route = 'sauvegarde';
    param = undefined;
  }
  return { route, param };
}

function Shell() {
  const { ready, error, data, setKV, sync, setAccessCode, saveInfo, storage } = useStore();
  const [hideErr, setHideErr] = useState(0);
  const { toast } = useUI();
  const [loc, setLoc] = useState(parseHash);
  const [mobile, setMobile] = useState(false);
  const [askName, setAskName] = useState('');
  const [code, setCode] = useState('');
  const [codeLater, setCodeLater] = useState(false);
  const [codeErr, setCodeErr] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const fb = sync.backend === 'firebase';
  const submitCode = async () => {
    if (!code.trim() || codeBusy) return;
    setCodeBusy(true);
    setCodeErr('');
    const err = await setAccessCode(code);
    setCodeBusy(false);
    if (err) setCodeErr(err);
    else {
      setCode('');
      if (fb) toast('Connecté au projet partagé : synchronisation en cours.');
    }
  };
  const collapsed = data.kv.settings.sidebarCollapsed;

  useEffect(() => {
    const h = () => setLoc(parseHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const go = useCallback((route: Route, id?: string) => {
    const hash = '#/' + route + (id ? '?id=' + encodeURIComponent(id) : '');
    if (window.location.hash === hash) setLoc({ route, param: id });
    else window.location.hash = hash;
    setMobile(false);
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, []);

  useAutoBackup((m, ok) => toast(m, ok ? 'info' : 'err'));

  // Chaque échec d'enregistrement est signalé tout de suite
  useEffect(() => {
    if (saveInfo.seq) toast("Échec de l'enregistrement : " + saveInfo.error + '. La modification n’a pas été conservée.', 'err');
  }, [saveInfo.seq]);

  if (error)
    return (
      <div className="boot">
        <Logo height={150} />
        <h2>PARKX n'a pas pu lire les données enregistrées</h2>
        <p>{error}</p>
        <p className="muted">Rien n'a été effacé. Fermez les autres onglets ouverts sur PARKX, puis rechargez la page (F5). Si le problème continue, redémarrez le navigateur.</p>
      </div>
    );
  if (!ready)
    return (
      <div className="boot">
        <Logo height={150} />
        <p className="muted">Chargement des données locales…</p>
      </div>
    );

  const P = { go, param: loc.param };
  const pages: Record<Route, JSX.Element> = {
    dashboard: <Dashboard {...P} />,
    presentation: <Presentation {...P} />,
    conception: <Conception {...P} />,
    schema: <Schema go={go} />,
    simulation: <Simulation3D go={go} />,
    fabrication: <Fabrication {...P} />,
    pcb: <PcbPage {...P} />,
    galerie: <Galerie {...P} />,
    documents: <Documents {...P} />,
    journal: <Journal {...P} />,
    sauvegarde: <Sauvegarde {...P} />,
    parametres: <Parametres {...P} />,
  };
  const s = data.kv.settings;

  return (
    <div className={'app ' + (collapsed ? 'sb-collapsed' : '')}>
      <Sidebar route={loc.route} go={go} collapsed={collapsed} setCollapsed={(v) => setKV('settings', { ...s, sidebarCollapsed: v })} mobileOpen={mobile} closeMobile={() => setMobile(false)} />
      <div className="main">
        <Topbar route={loc.route} go={go} openMobile={() => setMobile(true)} />
        {storage.mode === 'memory' && (
          <div className="save-banner no-print" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <b>Attention : ce navigateur n'enregistre rien ici</b> ({storage.reason}). Tout ce que vous saisissez sera perdu à la fermeture de la page.
              <br />
              Solution : ouvrez PARKX en double-cliquant sur le fichier <b>index.html</b> (ou PARKX.html) dans Chrome ou Edge, hors navigation privée, ou utilisez le site en ligne de l'équipe. En attendant, exportez une sauvegarde avant de fermer.
            </div>
            <Btn small kind="primary" icon="download" onClick={() => go('sauvegarde')}>Exporter une sauvegarde</Btn>
          </div>
        )}
        {storage.mode === 'disk' && saveInfo.state === 'error' && hideErr !== saveInfo.seq && (
          <div className="save-banner no-print" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <b>La dernière modification n'a pas été enregistrée</b> : {saveInfo.error}. L'écran n'affiche que ce qui est réellement enregistré : recommencez la modification. Si le problème continue, exportez une sauvegarde.
            </div>
            <Btn small icon="shield" onClick={() => go('sauvegarde')}>Sauvegarde</Btn>
            <Btn small kind="ghost" icon="x" aria-label="Masquer" onClick={() => setHideErr(saveInfo.seq)} />
          </div>
        )}
        <main className="content" key={loc.route}>
          {pages[loc.route]}
        </main>
        <footer className="app-foot no-print">
          <span className="sign-txt">{SIGNATURE}</span>
        </footer>
      </div>

      {sync.mode === 'remote' && sync.state === 'auth' && !codeLater && s.currentUser && (
        <Modal
          title={fb ? 'Connexion au projet partagé' : "Code d'accès de l'équipe"}
          icon="shield"
          onClose={() => setCodeLater(true)}
          footer={
            <>
              <Btn onClick={() => setCodeLater(true)}>Plus tard</Btn>
              <Btn kind="primary" icon="check" disabled={!code.trim() || codeBusy} onClick={submitCode}>{codeBusy ? 'Connexion…' : fb ? 'Se connecter' : 'Valider'}</Btn>
            </>
          }
        >
          {fb ? (
            <p className="muted">
              Les données de PARKX sont partagées avec l'équipe grâce à Firebase. Saisissez le <b>mot de passe de l'équipe</b> : il n'est demandé qu'une fois sur cet ordinateur. En attendant, vos modifications sont conservées sur cet appareil.
            </p>
          ) : (
            <p className="muted">Ce site est protégé. Saisissez le code d'accès communiqué par l'équipe pour partager les données. En attendant, vos modifications sont conservées sur cet appareil.</p>
          )}
          {fb && sync.account && <p className="small">Compte d'équipe : <b>{sync.account}</b></p>}
          <Field label={fb ? "Mot de passe de l'équipe" : "Code d'accès"} full error={codeErr}>
            <input type="password" autoFocus value={code} onChange={(e) => { setCode(e.target.value); setCodeErr(''); }} onKeyDown={(e) => e.key === 'Enter' && submitCode()} />
          </Field>
        </Modal>
      )}

      {!s.currentUser && (
        <Modal
          title="Bienvenue dans PARKX"
          icon="user"
          onClose={() => setKV('settings', { ...s, currentUser: 'Contributeur' })}
          footer={
            <Btn
              kind="primary"
              icon="check"
              onClick={() => {
                const n = askName.trim() || 'Contributeur';
                setKV('settings', { ...s, currentUser: n, contributors: Array.from(new Set([...s.contributors, n])) }, 'Contributeur actuel : ' + n);
              }}
            >
              Commencer
            </Btn>
          }
        >
          <div className="welcome">
            <Logo height={128} />
            <p>Indiquez votre prénom : il servira à identifier vos contributions (tâches, modifications, journal). Vous pourrez le changer dans Paramètres.</p>
            <Field label="Votre prénom" full>
              <input list="wl" autoFocus value={askName} onChange={(e) => setAskName(e.target.value)} placeholder="Ex. : Matthias" />
              <datalist id="wl">{s.contributors.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </StoreProvider>
  );
}
