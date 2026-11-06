import React, { useState, useEffect } from 'react';
import { Modal, Button, cx } from '../ui';

import { t, msg } from '../../i18n';
interface BreathingCalmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after each full round (in 4, hold 7, out 8), with the seconds it took */
  onRoundDone?: (seconds: number) => void;
}

type BreathPhase = 'inhale' | 'hold' | 'exhale';

const ROUNDS = 4;

const PHASE_TEXT: Record<BreathPhase, string> = {
  inhale: msg('Breathe in'),
  hold: msg('Hold gently'),
  exhale: msg('Breathe out slowly'),
};

/** Guided 4-7-8 breathing: in for 4, hold for 7, out for 8. */
export const BreathingCalmModal: React.FC<BreathingCalmModalProps> = ({ isOpen, onClose, onRoundDone }) => {
  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [countdown, setCountdown] = useState<number>(4);
  const [cycle, setCycle] = useState<number>(1);
  const done = cycle > ROUNDS;

  // Start fresh every time the exercise opens
  useEffect(() => {
    if (isOpen) {
      setPhase('inhale');
      setCountdown(4);
      setCycle(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || done) return;
    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(c => c - 1);
        return;
      }
      if (phase === 'inhale') {
        setPhase('hold');
        setCountdown(7);
      } else if (phase === 'hold') {
        setPhase('exhale');
        setCountdown(8);
      } else {
        setPhase('inhale');
        setCountdown(4);
        setCycle(c => c + 1);
        onRoundDone?.(4 + 7 + 8);
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, countdown, phase, done]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("Breathe with me")}
      subtitle={t("Let the feeling rise and pass. Follow the circle.")}
      size="sm"
      footer={
        <Button block size="lg" onClick={onClose}>
          {t("I feel calmer")}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <p className="m-0 text-[0.9375rem] font-semibold text-ink-3">{done ? t("Done") : t("Round {cycle} of 4", { cycle })}</p>

        <div className="flex h-56 w-56 items-center justify-center" aria-hidden="true">
          <div
            className={cx(
              'flex h-52 w-52 items-center justify-center rounded-full bg-pri-soft transition-transform ease-in-out',
              phase === 'inhale' ? 'scale-105 duration-[4000ms]' : phase === 'hold' ? 'scale-105 duration-500' : 'scale-[0.78] duration-[8000ms]'
            )}
          >
            <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-pri text-[#fff]">
              <span className="text-[3rem] font-extrabold leading-none tabular-nums">{done ? '✓' : countdown}</span>
            </div>
          </div>
        </div>

        <p className="m-0 text-2xl font-bold text-ink" aria-live="polite">
          {done ? t("You rode the wave") : t(PHASE_TEXT[phase])}
        </p>

      </div>
    </Modal>
  );
};
