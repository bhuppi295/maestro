import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs — webview has no server root, absolute
  // paths (e.g. /assets/codicon.ttf) 404 and icons render as boxes.
  base: './',
  build: {
    outDir: 'dist',
    // Single JS/CSS output — extension references these by fixed name
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
