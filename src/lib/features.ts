/** Switches for features that need set-up outside the app (see .env.example). */
/**
 * Sign in with Google / with a text message code. Shown only when switched on, because each needs
 * set-up in the Supabase dashboard first (Google: Authentication → Providers → Google; phone:
 * Authentication → Providers → Phone with Twilio Verify). Until then the buttons would only fail.
 */
export const GOOGLE_SIGN_IN: boolean = typeof import.meta.env === 'object' && import.meta.env.VITE_AUTH_GOOGLE === 'true';
export const PHONE_SIGN_IN: boolean = typeof import.meta.env === 'object' && import.meta.env.VITE_AUTH_PHONE === 'true';
