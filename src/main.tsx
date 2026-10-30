import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installTranslateDomGuards } from './utils/translateUtils';
import { AppErrorBoundary, reportClientError } from './components/AppErrorBoundary';

// Lets Google Translate rewrite text without breaking React's updates
installTranslateDomGuards();

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
