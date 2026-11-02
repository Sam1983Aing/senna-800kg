import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under /senna-800kg/ on GitHub Pages
  base: './',
  server: {
    port: 5405,
    host: '127.0.0.1',
  },
  preview: {
    port: 5405,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
