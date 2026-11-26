import { useState } from 'react';
import { Card, PageShell } from '../components/PageShell';
import { useStore } from '../db/store';
import { SIGNATURE } from '../db/types';
import { Btn, useUI } from '../components/ui';
import { Icon } from '../components/Icons';
import { Logo } from '../components/Logo';
import type { Route } from '../components/Layout';

export default function Parametres({ go }: { go: (r: Route, id?: string) => void; param?: string }) {
  const { data, setKV, sync } = useStore();
  const { toast, confirm } = useUI();
  const s = data.kv.settings;
  const [name, setName] = useState(s.currentUser);
  const [newC, setNewC] = useState('');
  const setSettings = (patch: Partial<typeof s>, label?: string) => setKV('settings', { ...s, ...patch }, label);
  const addMember = () => {
    if (!newC.trim()) return;
    setSettings({ contributors: Array.from(new Set([...s.contributors, newC.trim()])) });
    setNewC('');
  };

  return (
    <PageShell title="Paramètres" icon="settings">
      <div className="grid g-2">
        <Card title="Contributeur actuel" icon="user">
          <p className="muted small">Votre prénom signe vos modifications (tâches, journal, historique).</p>
          <div className="inline-form">
            <input list="contribs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre prénom" />
            <datalist id="contribs">{s.contributors.map((c) => <option key={c} value={c} />)}</datalist>
            <Btn kind="primary" icon="save" onClick={() => { if (!name.trim()) return toast('Indiquez un nom.', 'err'); setSettings({ currentUser: name.trim(), contributors: Array.from(new Set([...s.contributors, name.trim()])) }, 'Contributeur actuel : ' + name.trim()); toast('Contributeur enregistré.'); }}>Enregistrer</Btn>
          </div>
          <h4>Équipe du projet</h4>
          <div className="chips static">
            {s.contributors.map((c) => (
              <span key={c} className="chip">
                {c}
                <button aria-label={'Retirer ' + c} onClick={async () => { if (await confirm({ title: 'Retirer ce contributeur ?', text: `« ${c} » ne sera plus proposé dans les listes. Ses contributions passées restent signées.` })) setSettings({ contributors: s.contributors.filter((x) => x !== c) }); }}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="inline-form">
            <input value={newC} onChange={(e) => setNewC(e.target.value)} placeholder="Ajouter un membre" onKeyDown={(e) => e.key === 'Enter' && addMember()} />
            <Btn icon="plus" onClick={addMember}>Ajouter</Btn>
          </div>
        </Card>
        <div className="stack">
          <Card title="Sauvegarde et données" icon="shield">
            <p className="muted small">Exporter, restaurer, date de la dernière sauvegarde, export automatique, points de restauration et réinitialisation.</p>
            <Btn icon="shield" onClick={() => go('sauvegarde')}>Ouvrir la page Sauvegarde</Btn>
          </Card>
          <Card title="À propos" icon="info">
            <div className="about">
              <Logo height={96} />
              <div>
                <p><b>PARKX</b> — suivi de fabrication de la maquette de parking.</p>
                <p className="muted small">{sync.backend === 'firebase' ? 'Données synchronisées avec votre projet Firebase (Cloud Firestore) ; aucun autre service n’est utilisé.' : sync.mode === 'remote' ? "Données partagées uniquement avec le serveur de votre hébergement (api.php) ; aucun autre service n'est utilisé." : "Fonctionne uniquement en local, hors connexion. Aucune donnée n'est envoyée sur Internet."}</p>
                <p className="sign-txt">{SIGNATURE}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
