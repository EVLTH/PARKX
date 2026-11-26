/* =====================================================================
   PARKX – RÉGLAGES FACILES À MODIFIER
   ---------------------------------------------------------------------
   1. Ouvrez ce fichier avec le Bloc-notes (Windows) ou TextEdit (Mac).
   2. Changez les valeurs entre guillemets '…' (gardez les guillemets et les virgules).
   3. Enregistrez, puis rechargez la page PARKX (touche F5).
   En cas d'erreur de frappe, PARKX garde ses valeurs par défaut.
   by Matthias AS Evan G
   ===================================================================== */
window.PARKX_REGLAGES = {

  // Logo affiché dans le menu et sur les impressions.
  // Pour changer de logo : remplacez le fichier « logo.webp » (ou indiquez ici un autre nom, ex. 'mon-logo.png').
  logo: 'logo.webp',

  // Couleurs de l'interface (codes couleur hexadécimaux, ex. '#002A52').
  // Les teintes claires (fonds, survols…) sont calculées automatiquement.
  couleurs: {
    bleuNuit:  '#002A52', // titres et textes forts (lettrage du logo)
    bleuFonce: '#00437D', // voiture et poteaux du logo
    bleu:      '#086DAF', // boutons, éléments actifs, statut « en cours »
    bleuClair: '#1189CF', // reflets, LED « maintenance »
    vert:      '#378827', // statut « terminé »
    vertFonce: '#0F7435', // statut « validé »
    vertClair: '#5AA818', // LED « libre »
    citron:    '#8EC513', // accents
    jaune:     '#FEC410', // accents
    orange:    '#F38513', // statut « en attente »
    rouge:     '#DC2626', // statut « bloqué », LED « occupé »
  },

  // Couleurs des LED de la maquette (facultatif : sinon vert / rouge / bleu ci-dessus)
  led: {
    // libre: '#5AA818',
    // occupe: '#DC2626',
    // maintenance: '#1189CF',
  },

  // Noms des rubriques dans le menu (laisser tel quel ou renommer)
  menu: {
    dashboard: 'Tableau de bord',
    presentation: 'Projet',
    conception: 'Plans',
    schema: 'Schéma 2D',
    simulation: 'Simulation 3D',
    fabrication: 'Fabrication',
    pcb: 'PCB',
    galerie: 'Photos',
    documents: 'Documents',
    journal: 'Journal',
    sauvegarde: 'Sauvegarde',
    parametres: 'Paramètres',
  },

  // Voiture personnalisée de la simulation 3D
  voiture: {
    nom: 'AZ computer28',        // texte sur les portières (le 1er mot est écrit en grand)
    couleurBandes: '#8DB83E',    // couleur des bandes et du becquet
    uneSur: 3,                   // en mode « voitures variées » : 1 voiture sur 3 est celle-ci
  },

  // Dimensions de référence du cahier des charges (en cm)
  reference: {
    plateW: 120,     // longueur de la plaque
    plateH: 80,      // largeur de la plaque
    border: 7.5,     // bordures
    aisle: 20,       // allée centrale
    placeDepth: 12,  // profondeur d'une place
    placeWidth: 7,   // largeur d'une place classique
    pmrWidth: 10,    // largeur de la place PMR
  },

  // Synchronisation entre plusieurs ordinateurs avec Firebase (gratuit, en temps réel) : voir FIREBASE.txt.
  // Tant que apiKey et projectId sont vides, PARKX fonctionne uniquement en local (dans le navigateur).
  firebase: {
    // Valeurs de « firebaseConfig » données par la console Firebase (Paramètres du projet > Vos applications)
    apiKey: 'AIzaSyCDJyu6FKSDmbIB4JJfChUFMNnZsXJ6HHs',
    authDomain: 'parkx-9a330.firebaseapp.com',
    projectId: 'parkx-9a330',
    appId: '1:252124873156:web:28d2a9ac08b5dc0f712491',
    // Adresse du compte d'équipe créé dans Firebase > Authentication (la même que dans firestore.rules)
    emailEquipe: '',
    // Nom du projet partagé (une autre valeur = un projet séparé dans la même base Firebase)
    projet: 'maquette',
  },

  // Autre possibilité de partage, sans Firebase : hébergement avec PHP (programme api.php livré dans ce dossier).
  // Ignoré si Firebase est configuré ci-dessus.
  serveur: {
    actif: true,          // false = toujours garder les données dans le navigateur uniquement
    adresse: 'api.php',   // programme serveur, livré dans ce dossier
    intervalle: 10,       // récupération des modifications des autres toutes les 10 secondes
  },
};
