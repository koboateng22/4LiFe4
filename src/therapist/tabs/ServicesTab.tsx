import React, { useState } from 'react';
import { BriefcaseMedical, Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Modal, Notice, SectionHeader, Switch, cx, inputClass, textareaClass } from '../../components/ui';
import type { SessionFormat, TherapistProfile, TherapyService } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import { FORMAT_LABEL } from '../data';
import { newId } from '../../lib/supabase';

import { t } from '../../i18n';

const FORMATS = Object.keys(FORMAT_LABEL) as SessionFormat[];
const LENGTHS = [15, 30, 45, 50, 60, 75, 90, 120];

const pill = (on: boolean) =>
  cx(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-[0.9375rem] font-semibold transition-colors cursor-pointer',
    on ? 'border-pri bg-pri-soft text-pri-ink' : 'border-line bg-surface text-ink hover:border-pri-text'
  );

const blank = (p: TherapistProfile): TherapyService => ({
  id: newId(),
  name: '',
  description: '',
  durationMin: p.sessionLength,
  feeGHS: p.feeGHS,
  formats: p.formats.length ? p.formats : ['video', 'voice'],
  active: true,
});

/** Why a service can't be saved yet, or null (the same limits as the database) */
const problem = (s: TherapyService): string | null => {
  if (s.name.trim().length < 2) return t('Give the service a name.');
  if (s.name.trim().length > 80) return t('The name can be up to 80 characters.');
  if (s.description.length > 400) return t('The description can be up to 400 characters.');
  if (!(s.durationMin >= 15 && s.durationMin <= 180)) return t('A session can be 15 to 180 minutes long.');
  if (!(s.feeGHS >= 0)) return t('The price cannot be below zero.');
  if (!s.formats.length) return t('Choose at least one way to meet.');
  return null;
};

/** What you offer: each service has its own length, price and ways to meet. Clients choose one when they book. */
export const ServicesTab: React.FC<{ therapist: TherapistProfile; store: TherapistStore }> = ({ therapist, store }) => {
  const services = store.data.services || [];
  const [editing, setEditing] = useState<TherapyService | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [removing, setRemoving] = useState<TherapyService | null>(null);
  const [tried, setTried] = useState(false);

  const open = (s: TherapyService | null) => {
    setIsNew(!s);
    setEditing(s ? { ...s } : blank(therapist));
    setTried(false);
  };
  const err = editing ? problem(editing) : null;
  const save = () => {
    setTried(true);
    if (!editing || err) return;
    store.saveService({ ...editing, name: editing.name.trim(), description: editing.description.trim() });
    setEditing(null);
  };
  const upcoming = (id: string) => store.data.sessions.filter(s => s.serviceId === id && s.status === 'scheduled').length;

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <SectionHeader
        title={t('Your services')}
        subtitle={t('Clients choose one when they book. Its length decides which times are free.')}
        action={
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => open(null)}>
            {t('Add a service')}
          </Button>
        }
      />

      {services.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pri-soft text-pri-ink">
            <BriefcaseMedical className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="m-0 text-base font-bold text-ink">{t('No services yet')}</p>
          <p className="m-0 text-[0.9375rem] text-ink-2">
            {t('Until you add one, clients book a standard {m}-minute session at GHS {fee}, as set in Availability.', { m: therapist.sessionLength, fee: therapist.feeGHS })}
          </p>
          <Button variant="secondary" icon={<Plus className="h-5 w-5" />} onClick={() => open(null)}>
            {t('Add your first service')}
          </Button>
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2" aria-label={t('Services')}>
          {services.map(s => (
            <li key={s.id}>
              <Card as="article" aria-label={s.name} className={cx('flex h-full flex-col gap-3', !s.active && 'opacity-75')}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 text-lg font-bold leading-snug text-ink">{s.name}</h3>
                  <Badge tone={s.active ? 'pri' : 'muted'} dot>
                    {s.active ? t('Offered') : t('Paused')}
                  </Badge>
                </div>
                {s.description && <p className="m-0 text-[0.9375rem] leading-relaxed text-ink-2">{s.description}</p>}
                <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {t('{n} min', { n: s.durationMin })}
                  </span>
                  <span className="font-bold text-ink">{s.feeGHS > 0 ? t('GHS {fee}', { fee: s.feeGHS }) : t('Free')}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {s.formats.map(f => (
                    <Badge key={f} tone="muted">
                      {t(FORMAT_LABEL[f])}
                    </Badge>
                  ))}
                </div>
                {upcoming(s.id) > 0 && <p className="m-0 text-sm text-ink-3">{t('{n} upcoming sessions', { n: upcoming(s.id) })}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => open(s)} aria-label={t('Edit {name}', { name: s.name })}>
                    {t('Edit')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => store.saveService({ ...s, active: !s.active })}>
                    {s.active ? t('Pause') : t('Offer again')}
                  </Button>
                  <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setRemoving(s)} aria-label={t('Delete {name}', { name: s.name })}>
                    {t('Delete')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? t('Add a service') : t('Edit service')}
        size="md"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('Cancel')}
            </Button>
            <Button onClick={save}>{isNew ? t('Add service') : t('Save changes')}</Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-5">
            <Field label={t('Name')} htmlFor="sv-name" hint={t('e.g. First consultation, Follow-up session, Family session')}>
              <input id="sv-name" type="text" maxLength={80} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
            </Field>
            <Field label={t('Description')} htmlFor="sv-desc" optional>
              <textarea id="sv-desc" rows={3} maxLength={400} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} className={textareaClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('Length')} htmlFor="sv-len">
                <select id="sv-len" value={editing.durationMin} onChange={e => setEditing({ ...editing, durationMin: Number(e.target.value) })} className={inputClass}>
                  {[...new Set([...LENGTHS, editing.durationMin])].sort((a, b) => a - b).map(m => (
                    <option key={m} value={m}>
                      {t('{m} minutes', { m })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Price (GHS)')} htmlFor="sv-fee" hint={t('0 for free')}>
                <input id="sv-fee" type="number" min={0} step="1" value={editing.feeGHS} onChange={e => setEditing({ ...editing, feeGHS: Number(e.target.value) })} className={inputClass} />
              </Field>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-sm font-bold text-ink">{t('Ways to meet')}</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(f => {
                  const on = editing.formats.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setEditing({ ...editing, formats: on ? editing.formats.filter(x => x !== f) : FORMATS.filter(x => x === f || editing.formats.includes(x)) })}
                      className={pill(on)}
                    >
                      {t(FORMAT_LABEL[f])}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Switch checked={editing.active} onChange={v => setEditing({ ...editing, active: v })} label={t('Offer this service')} description={t('When off, clients cannot choose it. Booked sessions are kept.')} />
            {tried && err && <Notice tone="warn">{err}</Notice>}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        title={t('Delete this service?')}
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t('Keep it')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removing) store.deleteService(removing.id);
                setRemoving(null);
              }}
            >
              {t('Delete')}
            </Button>
          </div>
        }
      >
        <p className="m-0 text-base text-ink-2">
          {t('“{name}” will no longer be offered. Sessions already booked for it stay in your calendar. To stop it for a while instead, pause it.', { name: removing?.name || '' })}
        </p>
      </Modal>
    </div>
  );
};
