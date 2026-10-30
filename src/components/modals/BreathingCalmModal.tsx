import React, { useState, useEffect } from 'react';
import { Modal, Button, cx } from '../ui';

interface BreathingCalmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHeartRateCalmed?: (newHr: number) => void;
}

type BreathPhase = 'inhale' | 'hold' | 'exhale';

const PHASE_TEXT: Record<BreathPhase, string> = {
  inhale: 'Breathe in',
  hold: 'Hold gently',
  exhale: 'Breathe out slowly',
};

/** Guided 4-7-8 breathing: in for 4, hold for 7, out for 8. */
export const BreathingCalmModal: React.FC<BreathingCalmModalProps> = ({ isOpen, onClose, onHeartRateCalmed }) => {
  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [countdown, setCountdown] = useState<number>(4);
  const [cycle, setCycle] = useState<number>(1);
  const [simulatedHr, setSimulatedHr] = useState<number>(84);

  // Start fresh every time the exercise opens
  useEffect(() => {
    if (isOpen) {
      setPhase('inhale');
      setCountdown(4);
      setCycle(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
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
        setSimulatedHr(prev => {
          const next = Math.max(68, prev - 3);
          onHeartRateCalmed?.(next);
          return next;
        });
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, countdown, phase]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Breathe with me"
      subtitle="Let the feeling rise and pass. Follow the circle."
      size="sm"
      footer={
        <Button block size="lg" onClick={onClose}>
          I feel calmer
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <p className="m-0 text-[0.9375rem] font-semibold text-ink-3">Round {cycle} of 4</p>

        <div className="flex h-56 w-56 items-center justify-center" aria-hidden="true">
          <div
            className={cx(
              'flex h-52 w-52 items-center justify-center rounded-full bg-pri-soft transition-transform ease-in-out',
              phase === 'inhale' ? 'scale-105 duration-[4000ms]' : phase === 'hold' ? 'scale-105 duration-500' : 'scale-[0.78] duration-[8000ms]'
            )}
          >
            <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-pri text-[#fff]">
              <span className="text-[3rem] font-extrabold leading-none tabular-nums">{countdown}</span>
            </div>
          </div>
        </div>

        <p className="m-0 text-2xl font-bold text-ink" aria-live="polite">
          {PHASE_TEXT[phase]}
        </p>

        <div className="grid w-full grid-cols-2 gap-3 text-left">
          <div className="rounded-xl bg-bg p-4">
            <p className="m-0 text-sm text-ink-3">Heart rate</p>
            <p className="m-0 text-xl font-extrabold text-ink">
              {simulatedHr} <span className="text-sm font-semibold text-ink-3">bpm</span>
            </p>
          </div>
          <div className="rounded-xl bg-bg p-4">
            <p className="m-0 text-sm text-ink-3">The craving</p>
            <p className="m-0 text-xl font-extrabold text-ink">Easing</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
