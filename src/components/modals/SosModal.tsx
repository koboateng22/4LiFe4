import React from 'react';
import { UserProfile } from '../../types';
import { CHECKED_HOTLINES, telHref } from '../../lib/ems';
import type { IncidentController, IncidentView } from '../../lib/incident';
import { EmergencyPanel } from '../ems/EmergencyPanel';
import { Modal, cx } from '../ui';
import { Phone, Wind, MessageCircle, MapPin, ShieldCheck } from 'lucide-react';

interface SosModalProps {
  profile: UserProfile;
  controller: IncidentController;
  view: IncidentView;
  isOpen: boolean;
  onClose: () => void;
  onOpenCalm: () => void;
  onOpenChat?: () => void;
  onOpenHelpNearby?: () => void;
  /** Open "My safety plan" on the Instant EMS screen */
  onOpenSafetyPlan?: () => void;
}

/**
 * The SOS screen: a few large, clear choices — never a wall of options.
 * Order: call for help, alert the people who support you, calm down, talk.
 */
export const SosModal: React.FC<SosModalProps> = ({ profile, controller, view, isOpen, onClose, onOpenCalm, onOpenChat, onOpenHelpNearby, onOpenSafetyPlan }) => {
  /** Only recorded if an alert is open. Calling doesn't start an alert or tell anyone by itself. */
  const noteCall = (number: '112' | '193') => {
    if (view.phase === 'active') controller.record('emergency_call_handoff', number, 'opened');
  };

  const bigOption = 'flex w-full min-h-[76px] items-center gap-4 rounded-2xl px-5 py-3 text-left no-underline transition-colors cursor-pointer';

  const helplines = CHECKED_HOTLINES.filter(h => h.id === 'gh-193' || h.id === 'gh-yonkodo');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="You are not alone" subtitle="Choose what you need right now." size="sm">
      <div className="flex flex-col gap-3">
        <a href="tel:112" onClick={() => noteCall('112')} className={cx(bigOption, 'bg-danger text-[#fff] hover:bg-danger-hover')}>
          <Phone className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span>
            <span className="block text-xl font-extrabold">Call 112</span>
            <span className="block text-[0.9375rem] opacity-95">Only a phone call reaches ambulance and emergency services</span>
          </span>
        </a>

        <EmergencyPanel profile={profile} controller={controller} view={view} />

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenCalm();
          }}
          className={cx(bigOption, 'bg-pri-soft text-pri-ink hover:brightness-95')}
        >
          <Wind className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span>
            <span className="block text-[1.1875rem] font-extrabold">Breathe with me</span>
            <span className="block text-[0.9375rem] opacity-90">A 2-minute calming exercise</span>
          </span>
        </button>

        {onOpenChat && (
          <button type="button" onClick={onOpenChat} className={cx(bigOption, 'border border-line bg-surface text-ink hover:bg-muted')}>
            <MessageCircle className="h-7 w-7 shrink-0 text-pri-text" aria-hidden="true" />
            <span>
              <span className="block text-[1.1875rem] font-extrabold">Talk to {profile.aiName || '4Life'}</span>
              <span className="block text-[0.9375rem] text-ink-2">Private support, right now</span>
            </span>
          </button>
        )}

        <div className="mt-2 flex flex-col">
          <h3 className="m-0 mb-1 text-base font-bold text-ink">More numbers</h3>
          {helplines.map(h => (
            <a
              key={h.id}
              href={telHref(h.number)}
              onClick={() => h.number === '193' && noteCall('193')}
              className="flex min-h-14 items-center justify-between gap-3 border-t border-line no-underline"
            >
              <span className="text-[0.9375rem] font-semibold text-ink">{h.label}</span>
              <span className="shrink-0 text-[0.9375rem] font-extrabold text-pri-text">{h.number}</span>
            </a>
          ))}
          {onOpenSafetyPlan && (
            <button
              type="button"
              onClick={onOpenSafetyPlan}
              className="flex min-h-14 items-center gap-2 border-t border-line text-left text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden="true" /> Open my safety plan
            </button>
          )}
          {onOpenHelpNearby && (
            <button
              type="button"
              onClick={onOpenHelpNearby}
              className="flex min-h-14 items-center gap-2 border-t border-line text-left text-[0.9375rem] font-bold text-pri-text hover:underline cursor-pointer"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" /> Find hospitals and recovery centres near me
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
