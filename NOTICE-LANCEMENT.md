# PARKX – Notice de lancement

**PARKX – Suivi de projet – Maquette de parking**
by Matthias AS Evan G

Rien à installer : PARKX s'ouvre dans le navigateur (Google Chrome ou Microsoft Edge à jour conseillés ; Firefox et Safari fonctionnent aussi).

---

## Méthode 1 – Dossier portable (conseillée)

1. Décompressez `PARKX.zip` : vous obtenez un dossier `PARKX` (ne l'ouvrez pas directement depuis le .zip).
2. Double-cliquez sur **`index.html`**.
3. Saisissez votre prénom à la première ouverture.

Les données sont enregistrées automatiquement et durablement dans le navigateur (indicateur **« Enregistré »** en haut, avec l'heure). Ouvrez toujours PARKX de la même façon, dans le même navigateur, hors navigation privée. Le menu **Sauvegarde** indique l'état réel de l'enregistrement et la date de votre dernière sauvegarde sur fichier.

**Envoyer PARKX** : compressez le dossier `PARKX` et envoyez le `.zip`. Les données ne voyagent pas avec le dossier : utilisez *Sauvegarde → Exporter une sauvegarde*, puis *Restaurer une sauvegarde* chez l'autre personne.

**Modifier PARKX sans programmer** (avec le Bloc-notes, puis F5 dans le navigateur) :

| Fichier | Ce qu'il permet |
|---|---|
| `reglages.js` | couleurs, noms du menu, voiture de la simulation 3D, dimensions de référence, partage en ligne |
| `logo.webp` | le logo (remplacez le fichier en gardant le même nom) |
| `perso.css` | retouches d'apparence |

Ne modifiez pas le dossier `app` ni `sw.js` (le programme).

## Méthode 2 – En ligne par FTP

Déposez le dossier `PARKX` dans le dossier public de votre hébergement (www, public_html, htdocs…) avec FileZilla, puis ouvrez `https://votre-site.fr/PARKX/`. C'est un site statique : **ni PHP ni MySQL ne sont nécessaires**. Marche à suivre, prérequis et mise à jour sans perte de données : **`INSTALLATION-FTP.txt`** (dans le dossier).

Sans synchronisation, chaque navigateur garde ses propres données (indicateur **« Enregistré · local »**). Pour que toute l'équipe partage les mêmes données en temps réel : **Firebase**, gratuit, guide **`FIREBASE.txt`** (indicateur **« Synchronisé »**). Sur un hébergement avec PHP, `api.php` peut aussi partager les données (sans Firebase).

## Méthode 3 – Fichier unique

Double-cliquez sur `application/PARKX.html` : même application, en un seul fichier.

> ⚠️ **Où sont mes données ?** Le navigateur range les données selon l'adresse de la page.
> - Dans Chrome et Edge, `PARKX.html` et `index.html` ouverts **par double-clic** partagent les mêmes données.
> - `http://localhost:4173` (méthode 4) et le site en ligne ont **chacun leurs propres données**.
> Pour passer de l'un à l'autre : *Sauvegarde → Exporter* depuis l'ancien, puis *Restaurer* (mode « Fusionner ») dans le nouveau — voir la notice de sauvegarde.

## Méthode 4 – Serveur local (installation comme une application)

Permet d'**installer PARKX comme une application** (icône « Installer » dans la barre d'adresse de Chrome ou Edge). Prérequis : [Node.js](https://nodejs.org) 18 ou plus.

- **Windows** : double-cliquez sur `Lancer-PARKX-Windows.bat`
- **macOS / Linux** : dans un terminal, depuis le dossier du projet : `sh lancer-parkx.sh`

Puis ouvrez **http://localhost:4173**. Laissez la fenêtre noire ouverte pendant l'utilisation.

---

## Développement (modifier le code)

```bash
npm install          # une seule fois (nécessite Internet)
npm run dev          # mode développement : http://localhost:5173
npm run build        # application/PARKX.html (fichier unique)
npm run portable     # portable/PARKX/ (dossier portable)
```

Tester le partage en ligne sur son ordinateur (PHP installé) :

```bash
npm run portable
php -S 127.0.0.1:8090 -t portable      # puis ouvrir http://127.0.0.1:8090/PARKX/
```

Tester Firebase sans compte Google, avec les émulateurs (`npm i -g firebase-tools`, Java 21 pour l'émulateur Firestore) :

```bash
firebase emulators:start --only firestore,auth --project demo-parkx
# compte d'équipe de test :
curl -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo" \
     -H "Content-Type: application/json" -d '{"email":"equipe@test.fr","password":"motdepasse"}'
```

puis, dans la partie `firebase` de `reglages.js` : `apiKey: 'demo'`, `projectId: 'demo-parkx'`, `emailEquipe: 'equipe@test.fr'` et la ligne `emulateur: { firestore: '127.0.0.1:8080', auth: '127.0.0.1:9099' },` (à retirer pour la vraie mise en ligne).

### Organisation du code

```
src/
  config.ts    lecture de reglages.js (couleurs, menu, voiture, Firebase, serveur PHP)
  db/          types.ts (modèle de données), idb.ts (IndexedDB : écritures durables, mode « mémoire seule »
               si le navigateur interdit le stockage), store.tsx (enregistrement auto suivi, erreurs affichées,
               cohérence entre onglets), firebaseSync.ts (synchronisation Firebase en temps réel),
               sync.ts (partage avec api.php), backup.ts (export/import), demo.ts
  lib/         geometry.ts (calculs du plan), parkingSim.ts (simulation), print.ts (impression A4), autoexport.ts
  components/  Logo, Layout (menu + barre supérieure), ParkingPlan (plan SVG), Parking3D (three.js),
               SimUI, PageShell (en-têtes d'impression), ui (boutons, modales…)
  pages/       une page par rubrique
  styles/      theme.css (couleurs du logo), app.css, print.css (impression A4)
portable-template/   fichiers du dossier portable : index.html, reglages.js, perso.css, api.php, firestore.rules,
                     guides LISEZ-MOI.txt, INSTALLATION-FTP.txt, FIREBASE.txt
public/              icônes, manifeste et service worker (sw.js)
```

---

## Simulation 3D

La rubrique **Simulation 3D** utilise WebGL (Chrome, Edge, Firefox et Safari récents). Elle fonctionne hors connexion : la bibliothèque 3D est incluse.
Si WebGL n'est pas disponible, un message s'affiche et le **Schéma 2D** reste disponible.

## Impression A4

Chaque rubrique possède un bouton **« Imprimer A4 »** en haut à droite. Dans la fenêtre d'impression :

- choisissez **« Enregistrer au format PDF »** ou votre imprimante ;
- **désactivez « En-têtes et pieds de page »** du navigateur : PARKX ajoute déjà ses propres en-têtes, la pagination « Page X / Y » et la signature *by Matthias AS Evan G* ;
- l'orientation est réglée automatiquement (paysage pour les plans, le schéma, les tâches et les PCB ; portrait pour les autres rubriques).

La pagination « Page X / Y » en marge est affichée par Chrome et Edge. Dans les autres navigateurs, l'en-tête et la signature restent présents dans le corps du document.
