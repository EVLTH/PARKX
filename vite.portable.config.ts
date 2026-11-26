import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build « portable » : un script classique (pas de module) + une feuille de style,
// pour fonctionner en double-cliquant sur index.html (file://) et sur n'importe quel hébergement.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'portable/PARKX/app',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.tsx',
      name: 'PARKX',
      formats: ['iife'],
      fileName: () => 'parkx.js',
    },
    rollupOptions: { output: { assetFileNames: 'parkx[extname]' } },
  },
});
