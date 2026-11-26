// Serveur local PARKX (sans dépendance) : sert le dossier « application » sur http://localhost:4173
// Usage : node serveur-local.mjs   — by Matthias AS Evan G
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), 'application');
const port = Number(process.env.PORT) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };

http
  .createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/' || p === '/index.html') p = '/PARKX.html';
      const file = normalize(join(root, p));
      if (!file.startsWith(root + sep)) throw new Error('interdit');
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
    }
  })
  .listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log(`\n  PARKX est lancé : ${url}\n  Laissez cette fenêtre ouverte. Fermez-la (ou Ctrl+C) pour arrêter.\n`);
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => undefined);
  })
  .on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé : PARKX est peut-être déjà lancé (${'http://localhost:' + port}).` : e.message);
  });
