import { defineConfig } from 'vitest/config';
import { META } from './src/data/meta.ts';

// base relativa para que el juego funcione bajo cualquier ruta de GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [
    {
      // El título del HTML se toma de META para no escribirlo a mano en dos sitios.
      name: 'inject-meta',
      transformIndexHtml: (html) =>
        html
          .replaceAll('%GAME_TITLE%', META.title)
          .replaceAll('%GAME_LANG%', META.lang)
          .replaceAll('%GAME_DESCRIPTION%', META.description),
    },
  ],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    // El paquete es casi todo Three.js (~580 kB sin comprimir, ~150 kB gzip), muy por debajo
    // del objetivo de 3 MB; dividirlo no aporta nada en un juego de una sola página.
    chunkSizeWarningLimit: 800,
    // Publica junto al juego los avisos de licencia de las dependencias incluidas (Three.js, MIT).
    license: { fileName: 'third-party-licenses.md' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
