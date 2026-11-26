import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build : un seul fichier dist/index.html autonome (ouvrable sans serveur).
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
