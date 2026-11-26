# PARKX – Notice de sauvegarde et de travail à plusieurs

by Matthias AS Evan G

## 1. Enregistrement automatique et permanent

Chaque ajout ou modification (tâche et avancement, fiche PCB, photo, document, journal, plan, paramètres, état des LED…) est **enregistré immédiatement** dans le stockage du navigateur (IndexedDB). Il n'y a pas de bouton « Enregistrer le projet ».

- Une modification n'apparaît à l'écran **qu'une fois réellement écrite sur le disque** par le navigateur : ce qui est affiché est ce qui est enregistré.
- Tout reste après la fermeture de la page, du navigateur, ou l'arrêt de l'ordinateur (vérifié, y compris après un arrêt brutal du navigateur).
- À l'ouverture, PARKX recharge toutes les données enregistrées et les affiche aussitôt.
- Les exemples de démonstration (marqués **DÉMO**) ne sont créés qu'au tout premier lancement, quand rien n'est encore enregistré. Ils ne remplacent **jamais** des données existantes.
- PARKX demande au navigateur de ne pas effacer ses données pour faire de la place (« protection contre l'effacement automatique », visible dans la page Sauvegarde).

L'indicateur en haut de l'écran donne l'état réel :

| Indicateur | Signification |
|---|---|
| **Enregistré · local 14:32** | tout est enregistré dans ce navigateur (heure du dernier enregistrement) ; aucune synchronisation n'est configurée : PARKX fonctionne uniquement en local |
| **Enregistrement…** | une écriture est en cours (quelques millisecondes) |
| **Erreur d'enregistrement** (rouge) | la dernière modification n'a pas été enregistrée ; un message explique pourquoi et le formulaire reste ouvert pour réessayer |
| **Non enregistré** (rouge) | le navigateur interdit l'enregistrement à cet endroit (voir § 2) |
| **Synchronisé** | enregistré ici et partagé avec l'équipe (Firebase ou api.php) |
| **Synchronisation en cours** | des modifications partent ou arrivent |
| **Hors ligne** | pas de connexion : les modifications sont gardées sur l'appareil et partiront au retour du réseau |
| **Erreur de synchronisation** (rouge) | le partage est bloqué (le message de la page Sauvegarde explique quoi faire) ; les données restent enregistrées ici |
| **Connexion requise / Code requis** | saisir le mot de passe de l'équipe (Firebase) ou le code d'accès (api.php) |

## 2. Limites du stockage dans le navigateur

Les données sont rangées **par navigateur et par adresse**. Elles ne sont pas retrouvées :

- si l'on **efface les données de navigation** (historique, cookies et données de sites) ;
- en **navigation privée** (tout est effacé à la fermeture de la fenêtre) ;
- dans **un autre navigateur, un autre ordinateur**, ou depuis une autre adresse (le fichier sur l'ordinateur et le site en ligne ont chacun leurs données) ;
- avec Firefox, si le dossier PARKX est **déplacé** ou ouvert **sans être décompressé**.

Certains environnements interdisent tout enregistrement (PARKX ouvert dans l'aperçu d'un autre site, réglages de confidentialité stricts). PARKX le détecte : l'indicateur affiche **« Non enregistré »** et un bandeau rouge explique la solution — ouvrir `index.html` (ou `PARKX.html`) par double-clic dans Chrome ou Edge, hors navigation privée, ou utiliser le site en ligne. En attendant, exportez une sauvegarde avant de fermer.

Dans tous les cas, **une sauvegarde sur fichier** (§ 3) permet de tout retrouver.

## 3. La page « Sauvegarde »

Menu **Sauvegarde** :

- **État** : enregistrement réel, date du dernier enregistrement, **date de la dernière sauvegarde sur fichier**, depuis quand les données sont conservées dans ce navigateur. Un rappel s'affiche s'il n'y a pas de sauvegarde depuis plus de 7 jours.
- **Exporter une sauvegarde** : un fichier `parkx-sauvegarde-AAAAMMJJ-HHMM.json` avec tout le projet, photos et documents compris. Conservez-le sur une clé USB, un disque externe ou un dossier cloud. (Dans « Contenu enregistré » : « Exporter les données seules », sans photos ni documents.)
- **Restaurer une sauvegarde** : choisissez un fichier `.json`. PARKX le vérifie, puis propose :
  - **Fusionner** (conseillé) : ajoute ce qui manque et garde vos données ; en cas de conflit, la version la plus récente (par défaut), la vôtre ou celle du fichier. Une fiche PCB restée vide cède toujours la place à une fiche remplie ;
  - **Remplacer tout** : les données sont remplacées par celles du fichier (confirmation demandée).
- Sections repliables :
  - **Export automatique** : un fichier .json toutes les 5 min à 2 h tant que PARKX est ouvert, seulement s'il y a eu des modifications (téléchargement daté, ou réécriture d'un fichier choisi avec Chrome / Edge) ;
  - **Points de restauration** : copies internes automatiques (toutes les 10 min en cas de modification, et avant chaque restauration ou réinitialisation), 20 dernières, hors photos et documents ;
  - **Contenu enregistré** : nombre d'éléments, espace utilisé, protection contre l'effacement, suppression des exemples DÉMO ;
  - **Réinitialiser les données** : efface les données de ce navigateur, uniquement après avoir tapé `SUPPRIMER`. Un point de restauration est créé avant. L'option « Recréer les exemples de démonstration » est décochée par défaut.

PARKX n'efface **jamais** de données automatiquement.

## 4. Travailler à plusieurs

### Avec Firebase (temps réel, conseillé)

Configuration une seule fois, gratuite, sans PHP ni MySQL : voir `FIREBASE.txt` (dans le dossier PARKX).

- Chaque ordinateur saisit **une fois** le mot de passe du compte d'équipe ; ensuite tout est automatique.
- Vos modifications partent aussitôt et apparaissent **en quelques secondes** chez les autres, sans recharger la page.
- Hors connexion, PARKX continue de fonctionner ; tout part au retour du réseau.
- Même élément modifié par deux personnes : la modification la plus récente est conservée, et tous les ordinateurs reprennent cette version.
- Une restauration s'applique à toute l'équipe ; « Réinitialiser » n'efface que l'ordinateur utilisé (les données de l'équipe sont rechargées).
- Sur un ordinateur partagé : *Sauvegarde → Synchronisation entre ordinateurs → Se déconnecter de cet ordinateur*.

### Avec un hébergement PHP

Le dossier PARKX déposé sur un hébergement avec PHP par FTP (voir `INSTALLATION-FTP.txt`) : `api.php` partage les mêmes données, conservées sur le serveur.

- Vos modifications partent aussitôt ; celles des autres arrivent automatiquement (vérification toutes les 10 s et à chaque retour sur la page). **Ce n'est pas du temps réel instantané.**
- Même élément modifié par deux personnes : la modification la plus récente est conservée, et tous les appareils reprennent cette version.
- Le serveur garde une copie par jour dans `donnees/sauvegardes` (30 jours).

### Sans synchronisation (échange de fichiers)

1. La personne A exporte une sauvegarde et transmet le fichier (clé USB, e-mail, dossier partagé).
2. La personne B la restaure en mode **Fusionner**.
3. B travaille, exporte à son tour, et A restaure en **Fusionner**.

Chaque modification est signée avec le prénom du contributeur (*Paramètres*), visible dans l'historique et les « Dernières modifications ».

## 5. Passer de la version locale à la version partagée

- **Même navigateur, même adresse** (par exemple le site en ligne utilisé seul jusqu'ici, puis Firebase configuré) : à la première connexion, les données déjà enregistrées dans ce navigateur sont envoyées automatiquement à l'équipe. Les exemples DÉMO ne sont pas envoyés.
- **Autre adresse ou autre ordinateur** (fichier ouvert par double-clic, ancien site…) :
  1. dans la version utilisée jusqu'ici : **Sauvegarde → Exporter une sauvegarde** ;
  2. ouvrez la version partagée, saisissez votre prénom (et le mot de passe de l'équipe avec Firebase) ;
  3. **Sauvegarde → Restaurer une sauvegarde** → choisissez le fichier → **Fusionner**.

Les données sont envoyées et apparaissent chez toute l'équipe.
