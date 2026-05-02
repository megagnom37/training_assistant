import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    https: false,
    // GIS OAuth popup posts back to opener; default COOP can block that → blank tab/popup.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
