# PARKX – Suivi de projet – Maquette de parking

Application web de **suivi de fabrication d'une maquette physique de parking** (ce n'est pas un logiciel de gestion de parking réel).

by Matthias AS Evan G

## Façons d'utiliser PARKX

| Version | Pour quoi | Comment |
|---|---|---|
| **Dossier portable** `portable/PARKX/` | l'usage courant, à envoyer, à modifier | double-clic sur `index.html`. Réglages dans `reglages.js`, logo `logo.webp`, apparence `perso.css` (voir `LISEZ-MOI.txt`) |
| **En ligne par FTP** (site statique) | ouvrir PARKX à une adresse web, sans PHP ni MySQL | déposer le dossier portable dans le dossier public de l'hébergement (voir `INSTALLATION-FTP.txt`) |
| **Synchronisation Firebase** | les mêmes données sur tous les ordinateurs, en temps réel | projet Firebase gratuit + partie `firebase` de `reglages.js` (voir `FIREBASE.txt`) |
| **Hébergement avec PHP** | autre façon de partager, sans Firebase | `api.php` est détecté automatiquement (voir `INSTALLATION-FTP.txt`) |
| **Fichier unique** `application/PARKX.html` | une seule pièce à copier | double-clic (données locales uniquement) |

Détails : [NOTICE-LANCEMENT.md](NOTICE-LANCEMENT.md) · Sauvegardes et travail à plusieurs : [NOTICE-SAUVEGARDE.md](NOTICE-SAUVEGARDE.md)

## Rubriques

| Rubrique | Contenu |
|---|---|
| Tableau de bord | Nom, état et avancement du projet, boutons d'ajout rapide (tâche, photo, journal), 4 indicateurs, puis une carte à onglets : prochaines étapes, dernières modifications, PCB, photos |
| Projet | Fiche du projet (bouton Modifier) ; la maquette en onglets : chiffres clés, dimensions, plan |
| Plans | Plan SVG technique paramétrique (cotations, marges, repères, zoom) ; onglets Mesures, Place (fiche lue puis « Modifier »), Versions |
| Schéma 2D / Simulation 3D | Onglets pour passer de l'un à l'autre : LED à l'entrée de chaque place, voitures animées dont le modèle « AZ computer28 », scénarios |
| Fabrication | Onglets À faire / Terminées / Toutes, liste par pages de 15, Kanban, planning, filtres repliés ; fiche de détails puis « Modifier » |
| PCB | 12 fiches (1 PCB pour 2 places), onglets par état ; fiche de détails avec emplacement sur le plan, formulaire en 3 onglets |
| Photos | Galerie par pages de 24, catégories, agrandissement, comparaison avant / après |
| Documents | Plans, schémas, fiches techniques, notices, PDF… par pages de 15, aperçu sécurisé |
| Journal | Entrées résumées (3 lignes), fiche complète au clic, par pages de 10, recherche et filtres |
| Sauvegarde | État réel de l'enregistrement, date de la dernière sauvegarde, exporter, restaurer ; sections repliables : export automatique, points de restauration, contenu, réinitialisation |
| Paramètres | Contributeur actuel et équipe, à propos |

Chaque rubrique a un bouton **« Imprimer A4 »** (en-tête, pagination et signature *by Matthias AS Evan G*) : à l'impression, tous les onglets, sections repliées et listes complètes sont imprimés.

## Enregistrement des données

Chaque modification est écrite immédiatement et durablement dans le navigateur (IndexedDB, écritures « strictes ») et n'apparaît à l'écran qu'une fois enregistrée. L'indicateur en haut de l'écran affiche « Enregistré · local » avec l'heure quand aucune synchronisation n'est configurée (PARKX fonctionne alors uniquement en local), « Erreur d'enregistrement » si une écriture échoue, ou « Non enregistré » si le navigateur interdit le stockage à cet endroit (avec la solution). Avec une synchronisation : « Synchronisé », « Synchronisation en cours », « Hors ligne » ou « Erreur de synchronisation ». Les exemples de démonstration ne sont créés qu'au tout premier lancement, jamais par-dessus des données existantes, et ne sont jamais envoyés à l'équipe. Détails et limites : [NOTICE-SAUVEGARDE.md](NOTICE-SAUVEGARDE.md).

## Règles du plan (figées)

- Plaque 120 × 80 cm, bordures 7,5 cm, surface intérieure 105 × 65 cm, allée centrale 20 cm.
- Rangée supérieure : 12 places classiques (n° 13 à 24).
- Rangée inférieure : **1 seule place PMR, tout en bas à gauche (n° 1)**, puis 11 places classiques (n° 2 à 12).
- 24 places, 12 PCB : PCB n = places 2n−1 et 2n.
- Les mesures sont modifiables dans *Plans* : le plan et les calculs suivent ; la disposition reste identique.

## Partage entre ordinateurs

### Firebase (conseillé, temps réel, sans PHP)

Configuration : partie `firebase` de `reglages.js` ; règles de sécurité : `firestore.rules` ; guide pas à pas : `FIREBASE.txt`.

- Données dans **Cloud Firestore** (offre gratuite Spark) ; photos et documents découpés en morceaux de 600 000 caractères dans Firestore (`files/{id}/parts`), car Cloud Storage exige désormais l'offre payante Blaze.
- Accès : **un compte d'équipe** Firebase Authentication (adresse + mot de passe), demandé une fois par ordinateur ; les règles n'autorisent que ce compte (aucune lecture ni écriture publique).
- Temps réel : écoute `onSnapshot` de chaque collection ; les changements des autres apparaissent en 1 à 2 secondes.
- Chaque modification est d'abord enregistrée sur l'appareil, puis envoyée par une transaction : la plus récente l'emporte (horodatage `_t`), tous les appareils reprennent la version retenue. Les suppressions sont transmises (marque `_del`), y compris aux ordinateurs hors ligne.
- Hors connexion : file d'envoi conservée sur l'appareil, envoyée au retour du réseau ; aucun doublon (identifiants stables).
- Première connexion : les données déjà présentes dans le navigateur sont envoyées (sauf les exemples DÉMO) ; rien n'est remplacé par des exemples.
- Sans `apiKey` ni `projectId` dans `reglages.js`, Firebase n'est pas utilisé et PARKX l'indique clairement (« local »).

### PHP (`api.php`)

Le dossier portable contient `api.php`, un petit serveur de données en PHP (7.4 ou plus), sans base de données à installer. Ignoré si Firebase est configuré.

- Chaque modification est enregistrée sur l'appareil puis envoyée aussitôt au serveur ; les modifications des autres sont récupérées toutes les 10 s et à chaque retour sur la page. **Ce n'est pas du temps réel instantané.**
- Même élément modifié par deux personnes : la modification la plus récente l'emporte et tous les appareils reprennent la version du serveur.
- Hors connexion (ou serveur indisponible) : les modifications attendent dans une boîte d'envoi conservée sur l'appareil et partent au retour du réseau.
- Données sur l'hébergement de l'équipe, dans `donnees/` : fichier de données protégé (illisible depuis le web), photos et documents sous des noms impossibles à deviner, une sauvegarde par jour (30 jours).
- Code d'accès d'équipe facultatif (`$CODE_ACCES` dans `api.php`) ; les exemples de démonstration ne sont jamais envoyés.
- Sans PHP ni Firebase (double-clic, hébergement statique), PARKX fonctionne en mode local : chaque navigateur garde ses données.

## Technique

React 18 + TypeScript + Vite · three.js (simulation 3D, embarquée) · SVG (plan, schéma) · IndexedDB · PWA (service worker) · Firebase JS SDK 13 (Authentication + Cloud Firestore, facultatif) · PHP 7.4+ facultatif. Sans configuration, aucun service externe n'est contacté.

```bash
npm install          # une seule fois
npm run dev          # développement : http://localhost:5173
npm run build        # application/PARKX.html (fichier unique autonome)
npm run portable     # portable/PARKX/ (index.html + app/parkx.js + fichiers de réglage)
```

## Scénarios de simulation (2D et 3D)

Trafic aléatoire · Heure de pointe (remplissage) · Fin de journée (vidage) · Test des LED PCB 01 → 12 (vert, rouge, bleu, sans voiture) · Maintenance d'un PCB (2 places bleues pendant que le trafic continue).
Les scénarios ne modifient jamais les états enregistrés ; à l'arrêt, chaque place reprend son état réel.

## Logo et couleurs

`logo/parkx-logo-officiel.png` : logo officiel ParkX tel que fourni.
`logo/parkx-logo-fond-transparent.png` : même logo, marges blanches retirées et fond transparent (dessin, proportions et couleurs inchangés).

La palette de l'interface est relevée sur le logo et centralisée dans `src/styles/theme.css` (CSS) et `src/styles/brand.ts` (dessins SVG). Dans le dossier portable, elle se modifie sans programmer dans `reglages.js`.

| Élément du logo | Couleur | Usage dans PARKX |
|---|---|---|
| Lettrage « Park » | #002A52 | titres, textes forts |
| Panneaux solaires | #086DAF / #1189CF | boutons, éléments actifs, statut « en cours », LED maintenance |
| Colline / X | #378827 · #0F7435 → #8EC513 | statut « terminé / validé », barres d'avancement, LED libre |
| Soleil | #FFDB2A → #F38513 | statut « en attente », accents |

Le rouge (#DC2626) reste réservé aux statuts « bloqué / problème » et à la LED « occupé », comme demandé dans le cahier des charges.
