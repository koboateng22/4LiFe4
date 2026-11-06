/**
 * Demo accounts and sample data (the demo client and therapist, example clients, sample
 * Village posts) are for development and previews only.
 *
 * On in `npm run dev`, and in a build only when VITE_ENABLE_DEMO=true (set it for preview
 * deployments, never for production). Vite writes the value into the code at build time, so in
 * a production build everything behind it is left out of the download entirely: the demo
 * accounts can't be shown, signed in to, or found in the files.
 * The demo therapist exists only on the device (no server account or API), so nothing else has
 * to be switched off. Demo accounts in a Supabase project come only from scripts/seed-demo.mjs,
 * which refuses to run unless asked explicitly; scripts/remove-demo.mjs deletes them.
 */
export const DEMO_ENABLED: boolean =
  typeof import.meta.env === 'object' && (import.meta.env.DEV === true || import.meta.env.VITE_ENABLE_DEMO === 'true');

