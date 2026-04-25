import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    https: false,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
