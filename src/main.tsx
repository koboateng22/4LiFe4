import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppErrorBoundary, reportClientError } from './components/AppErrorBoundary';
import { savedLanguage, setLanguage } from './i18n';

// Keep the app on the phone so emergency help still opens without internet (production builds only)
if ((import.meta as any).env?.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Offline support is not available', err));
  });
}

// Errors outside React (in timers, promises) reach the server logs too, a few per visit at most
if ((import.meta as any).env?.PROD) {
  let sent = 0;
  const send = (e: unknown, where: string) => sent++ < 5 && reportClientError(e, where);
  window.addEventListener('error', e => send(e.error || e.message, 'window'));
  window.addEventListener('unhandledrejection', e => send(e.reason, 'promise'));
  // the app loaded fine, so a later "new version" reload is allowed again
  setTimeout(() => {
    try {
      sessionStorage.removeItem('4life_chunk_reload');
    } catch {}
  }, 15000);
}

// The Privacy Policy is its own page at /privacy: open to everyone, no sign-in, none of the app around it
const PrivacyPage = lazy(() => import('./components/privacy/PrivacyPage'));
const isPrivacyPage = /^\/privacy\/?$/.test(window.location.pathname);
// The admin dashboard is its own page at /admin (the database decides who may use it)
const AdminApp = lazy(() => import('./admin/AdminApp'));
const isAdminPage = /^\/admin\/?$/.test(window.location.pathname);

// Start in the language chosen last time (its words load first, so nothing flashes in English)
setLanguage(savedLanguage()).finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        {isPrivacyPage || isAdminPage ? (
          <Suspense fallback={null}>{isAdminPage ? <AdminApp /> : <PrivacyPage />}</Suspense>
        ) : (
          <App />
        )}
      </AppErrorBoundary>
    </StrictMode>,
  )
);
