// Copie le build autonome vers application/PARKX.html (+ fichiers PWA)
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('application', { recursive: true });
copyFileSync('dist/index.html', 'application/PARKX.html');
for (const f of ['manifest.webmanifest', 'sw.js', 'parkx-icon-192.png', 'parkx-icon-512.png', 'apple-touch-icon.png']) copyFileSync('public/' + f, 'application/' + f);
console.log('application/PARKX.html mis à jour.');
