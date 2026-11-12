/**
 * What the chat shows when the AI couldn't answer: what happened, in plain words, and a way to
 * try again. Shown as a notice, never as if the AI had said it.
 */
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui';
import type { ChatFailure } from '../../lib/aiChat';
import { t, msg } from '../../i18n';

/** The message for each reason, and whether trying again could help */
export function describeFailure(f: ChatFailure): { text: string; retry: boolean } {
  // Both the main AI service and its backup were tried, for a reason that passes
  if (f.backupFailed && ['rate_limited', 'quota_exhausted', 'overloaded', 'timeout', 'network', 'empty'].includes(f.code)) {
    return {
      text: msg('Both our main AI service and its backup are unavailable right now. Please try again in a few minutes. Breathing, the thought record and SOS still work.'),
      retry: true,
    };
  }
  switch (f.code) {
    case 'not_configured':
      return { text: msg("The AI companion isn't set up on this server yet, so it can't answer. The other tools on this page still work."), retry: false };
    case 'quota_exhausted':
      return {
        text: msg('The AI companion has used up its free daily limit. It starts again each morning (about 7 to 8 a.m. Ghana time). Until then, breathing, the thought record and SOS still work.'),
        retry: false,
      };
    case 'rate_limited':
      return f.retryAfter
        ? { text: t('Many people are using the AI right now. Please wait {seconds} seconds, then try again.', { seconds: f.retryAfter }), retry: true }
        : { text: msg('Many people are using the AI right now. Please wait a minute, then try again.'), retry: true };
    case 'overloaded':
    case 'server':
      return { text: msg('The AI service is busy or having problems right now. Please try again in a moment.'), retry: true };
    case 'timeout':
      return { text: msg('The AI took too long to answer. Please try again.'), retry: true };
    case 'offline':
      return { text: msg("You're offline. Your message is kept here: try again when you're connected."), retry: true };
    case 'unreachable':
    case 'network':
      return { text: msg('Could not reach the AI service. Check your connection and try again.'), retry: true };
    case 'blocked':
      return { text: msg("The AI couldn't answer this message. Try saying it another way. If you're in danger, call 112."), retry: false };
    case 'empty':
      return { text: msg("The AI didn't send an answer. Please try again."), retry: true };
    case 'auth':
      return { text: msg('Please sign in again to use the AI companion.'), retry: false };
    case 'too_long':
      return { text: msg('That message is too long. Please make it shorter.'), retry: false };
    default:
      // bad_key, bad_model, bad_request, unknown: a set-up problem on our side, logged on the server
      return { text: msg("The AI companion isn't working right now because of a problem on our side. Please try again later."), retry: true };
  }
}

export const ChatFailureNotice: React.FC<{ failure: ChatFailure; onRetry?: () => void; busy?: boolean }> = ({ failure, onRetry, busy }) => {
  const { text, retry } = describeFailure(failure);
  return (
    <div role="alert" className="flex flex-col gap-2.5 rounded-2xl border border-warn bg-warn-soft px-4 py-3.5 text-[0.9375rem] leading-relaxed text-ink">
      <p className="m-0 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
        <span>
          {failure.partial && <strong className="block">{t('The reply was cut off')}</strong>}
          {t(text)}
        </span>
      </p>
      {retry && onRetry && (
        <Button size="sm" variant="secondary" className="self-start" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry} disabled={busy}>
          {t('Try again')}
        </Button>
      )}
    </div>
  );
};
