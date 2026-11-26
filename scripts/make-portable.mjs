// Assemble le dossier portable « portable/PARKX » à partir du build et des modèles.
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
const out = 'portable/PARKX';
const FILES = ['index.html', 'reglages.js', 'perso.css', 'logo.webp', 'api.php', 'firestore.rules',
  'LISEZ-MOI.txt', 'INSTALLATION-FTP.txt', 'FIREBASE.txt'];
for (const f of FILES) cpSync('portable-template/' + f, out + '/' + f);
// ancien guide remplacé par INSTALLATION-FTP.txt
if (existsSync(out + '/MISE-EN-LIGNE.txt')) rmSync(out + '/MISE-EN-LIGNE.txt');
// copie hors connexion de l'application (site en ligne) : doit rester à la racine du dossier
cpSync('public/sw.js', out + '/sw.js');
// la feuille de style produite par Vite s'appelle parkx.css (ou style.css selon la version)
const css = readdirSync(out + '/app').find((f) => f.endsWith('.css'));
if (css && css !== 'parkx.css') renameSync(out + '/app/' + css, out + '/app/parkx.css');
if (!existsSync(out + '/app/parkx.js')) throw new Error('parkx.js absent');
// numéro de version dans les liens : après une mise à jour par FTP, les navigateurs
// chargent forcément le nouveau programme (pas l'ancien gardé en cache)
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
const html = readFileSync(out + '/index.html', 'utf8')
  .replace('href="app/parkx.css"', `href="app/parkx.css?v=${v}"`)
  .replace('src="app/parkx.js"', `src="app/parkx.js?v=${v}"`);
if (!html.includes('?v=' + v)) throw new Error('index.html : liens du programme introuvables');
writeFileSync(out + '/index.html', html);
console.log('Dossier portable prêt : ' + out + ' (version ' + v + ')');
