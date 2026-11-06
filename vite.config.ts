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

/**
 * English text is its own key, so in a build the English language files keep only the entries
 * that differ from their key (plural forms). The rest would only make the first download bigger.
 * In development the full files stay, so missing translations can still be reported.
 */
const slimEnglish = (): Plugin => ({
  name: 'slim-english',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!/[\\/]src[\\/]locales[\\/]en[\\/][^\\/]+\.json$/.test(id)) return null;
    const all = JSON.parse(code) as Record<string, unknown>;
    return { code: JSON.stringify(Object.fromEntries(Object.entries(all).filter(([k, v]) => v !== k))), map: null };
  },
});

// SINGLE_FILE=1 inlines every asset (used only for the one-page preview build)
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), slimEnglish(), ...(singleFile ? [] : [assetList()])],
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
