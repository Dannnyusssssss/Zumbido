import { defineConfig } from 'vitest/config';
import { META } from './src/data/meta.ts';

/**
 * Política de seguridad del contenido. GitHub Pages no permite cabeceras propias, así que va en un
 * <meta>: solo archivos del propio origen, sin objetos incrustados, sin formularios y sin cambiar la
 * base de las rutas. Un <meta> no admite `frame-ancestors` (el portal debe poder embeber el juego).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const CHARSET = '<meta charset="UTF-8" />';

// base relativa para que el juego funcione bajo cualquier ruta de GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [
    {
      // Solo en el build: en `npm run dev` Vite necesita scripts en línea y su propia conexión.
      name: 'security-meta',
      apply: 'build',
      transformIndexHtml: (html) => {
        if (!html.includes(CHARSET)) throw new Error('index.html: falta la etiqueta charset');
        return html.replace(
          CHARSET,
          `${CHARSET}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />` +
            '\n    <meta name="referrer" content="strict-origin-when-cross-origin" />',
        );
      },
    },
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
