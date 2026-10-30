/**
 * "What helped today": a short wrap-up at the end of an AI therapy chat.
 * Tick what helped, add a note if you like, and it is remembered on this phone
 * so next time 4Life (and the app) can suggest it first.
 */
import React, { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { COPING_STEPS, saveHelped, type HelpedEntry } from '../../lib/coping';
import { Button, Chip, Field, Modal, textareaClass } from '../ui';
import { CravingLevels, cravingLabel } from './CravingLevels';

export const HelpedModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  mode: string;
  before?: number;
  after?: number;
  onSaved: (e: HelpedEntry) => void;
}> = ({ isOpen, onClose, uid, mode, before, after, onSaved }) => {
  const [steps, setSteps] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [now, setNow] = useState<number | undefined>(after);
  const labelId = useId();

  useEffect(() => {
    if (isOpen) {
      setSteps(['talking']);
      setNote('');
      setNow(after);
    }
  }, [isOpen, after]);

  const toggle = (id: string) => setSteps(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const save = () => {
    const e = saveHelped(uid, { mode, steps, note: note.trim() || undefined, before, after: now });
    onSaved(e);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="What helped today?"
      subtitle="Saved on this phone, so next time you can start with what works for you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button onClick={save} disabled={!steps.length} icon={<Check className="h-5 w-5" />}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {before !== undefined && (
          <div className="flex flex-col gap-2">
            <p id={labelId} className="m-0 text-base font-bold text-ink">
              You started {cravingLabel(before)}. How strong is the craving now?
            </p>
            <CravingLevels labelledBy={labelId} value={now} onChange={setNow} />
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          <p className="m-0 text-base font-bold text-ink" id={`${labelId}-steps`}>
            What helped? Tick all that fit.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${labelId}-steps`}>
            {COPING_STEPS.map(s => (
              <Chip key={s.id} selected={steps.includes(s.id)} onClick={() => toggle(s.id)} aria-pressed={steps.includes(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Anything else to remember?" htmlFor="helped-note" hint="Optional. For example: Mary always picks up after 8 pm.">
          <textarea id="helped-note" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} className={textareaClass} />
        </Field>
      </div>
    </Modal>
  );
};
