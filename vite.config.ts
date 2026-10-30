import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/** Writes dist/asset-list.json so the service worker can save every page of the app for offline use */
const assetList = (): Plugin => ({
  name: 'asset-list',
  apply: 'build',
  generateBundle(_opts, bundle) {
    const files = Object.keys(bundle)
      .filter(f => /\.(js|css|woff2)$/.test(f))
      .map(f => '/' + f);
    this.emitFile({ type: 'asset', fileName: 'asset-list.json', source: JSON.stringify(files) });
  },
});

// SINGLE_FILE=1 inlines every asset (used only for the one-page preview build)
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), ...(singleFile ? [] : [assetList()])],
  build: singleFile
    ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } }
    : { sourcemap: false, chunkSizeWarningLimit: 900 },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
