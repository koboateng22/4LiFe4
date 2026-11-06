/**
 * Last line of defence: if a screen crashes, show a calm message with the
 * emergency numbers instead of a blank page.
 *
 * After a new version is deployed, a phone that still has the old app open can
 * fail to load a page (its file no longer exists). That case reloads once to
 * pick up the new version.
 */
import React from 'react';

import { t, T } from '../i18n';
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;
const RELOAD_KEY = '4life_chunk_reload';

/** Sends a short error report to the server logs (no personal details) */
export function reportClientError(error: unknown, where: string) {
  try {
    const e = error as Error;
    const body = JSON.stringify({
      message: String(e?.message || error).slice(0, 300),
      stack: String(e?.stack || '').slice(0, 1200),
      where: where.slice(0, 60),
      page: location.pathname.slice(0, 100),
    });
    // keepalive lets the report finish even if the page reloads
    fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    /* reporting must never break the app */
  }
}

interface State {
  failed: boolean;
}

interface Props {
  children: React.ReactNode;
  /** Inside a page: keep the menu and SOS around it instead of filling the screen */
  inline?: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (CHUNK_ERROR.test(String(error?.message || error))) {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
        sessionStorage.setItem(RELOAD_KEY, '1');
      } catch {
        /* storage blocked: fall through to the message */
      }
      if (!reloaded) {
        location.reload();
        return;
      }
    }
    reportClientError(error, (info.componentStack || '').trim().split('\n')[0] || 'render');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={this.props.inline ? 'flex justify-center px-2 py-16 text-ink' : 'flex min-h-[100dvh] items-center justify-center bg-bg p-6 text-ink'}>
        <div className="w-full max-w-sm text-center">
          <h1 className="m-0 text-xl font-bold">{this.props.inline ? t("This page didn’t load") : t("Something went wrong")}</h1>
          <p className="mt-2 text-base leading-relaxed text-ink-2">{t("Your saved information is safe. Reload the app to carry on.")}</p>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(RELOAD_KEY);
              } catch {
                /* ignore */
              }
              location.reload();
            }}
            className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-pri px-5 text-base font-bold text-[#fff]"
          >
            {t("Reload")}
          </button>
          <p className="mt-6 text-sm text-ink-3">
            <T text="In danger right now? Call <0>112</0> or <1>193</1> (ambulance)." parts={[<a href="tel:112" className="font-bold text-danger-text" />, <a href="tel:193" className="font-bold text-danger-text" />]} />
          </p>
        </div>
      </div>
    );
  }
}
