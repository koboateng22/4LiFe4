/**
 * The alert part of the SOS screen. It only says what is known:
 * a saved record is "saved", an opened messaging app is "opened", and
 * nothing here means an ambulance is coming. The call and message buttons
 * never depend on the server, so every state still has a way forward.
 */
import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, MapPin, MessageSquare, Phone, RefreshCw, Send, UserRound } from 'lucide-react';
import type { UserContact, UserProfile } from '../../types';
import { locationMessage, smsHref, telHref, whatsappHref, type Fix } from '../../lib/ems';
import { isFreshFix, type Channel, type HandoffAction, type IncidentController, type IncidentView } from '../../lib/incident';
import { Button, Field, Notice, cx, inputClass } from '../ui';

const clock = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const firstName = (c: UserContact) => c.name.split('(')[0].trim();

/** The headline: what is true right now, and what to do next. */
export function statusText(v: IncidentView): { title: string; detail: string; tone: 'pri' | 'warn' | 'danger' | 'info' } {
  const i = v.incident;
  switch (v.phase) {
    case 'submitting':
      return { title: 'Saving your alert…', detail: 'You don’t need to wait. You can call or send a message now.', tone: 'info' };
    case 'unknown':
      return { title: 'Not sure yet if your alert was saved', detail: 'The answer didn’t come back, so we’re checking. Don’t rely on it: call or send a message now.', tone: 'warn' };
    case 'offline':
      return { title: 'You’re offline. Your alert is not saved yet', detail: 'It will be sent when you’re back online. Calling 112 and sending a text don’t need internet.', tone: 'warn' };
    case 'failed':
      if (v.failure === 'auth') return { title: 'Your alert was not saved', detail: 'You need to sign in again. No one was told. Call 112 or send a message now.', tone: 'danger' };
      if (v.failure === 'rate_limited') return { title: 'Your alert was not saved', detail: 'Too many alerts in the last hour. No one new was told. Call 112 or send a message now.', tone: 'danger' };
      if (v.failure === 'too_old') return { title: 'An earlier alert could not be confirmed', detail: 'We never got an answer, so we stopped trying. If you still need help, call 112 or start again.', tone: 'danger' };
      return { title: 'Your alert was not saved', detail: 'No one was told. Call 112 or send a message now.', tone: 'danger' };
    case 'closed':
      if (i?.status === 'cancelled') return { title: `Alert cancelled at ${clock(i.closed_at)}`, detail: v.mode === 'server' ? 'A counsellor you are linked with can see that it was a mistake.' : 'Saved on this phone only.', tone: 'info' };
      if (i?.status === 'expired') return { title: 'This alert closed by itself', detail: 'It was open for 24 hours. If you need help now, call 112 or start again.', tone: 'warn' };
      return { title: `Alert closed at ${clock(i?.closed_at)}`, detail: 'Glad you’re safe. You can start a new alert any time.', tone: 'pri' };
    case 'active':
      if (v.mode === 'device') return { title: `Alert started at ${clock(i?.created_at)}, on this phone only`, detail: 'You’re not signed in to an account, so 4Life has not told anyone. Use the buttons below.', tone: 'warn' };
      if (i?.status === 'acknowledged') return { title: 'Your counsellor has seen your alert', detail: 'That isn’t an ambulance. If you’re in danger, call 112.', tone: 'pri' };
      if (i?.status === 'contact_notified') return { title: `Alert saved at ${clock(i.created_at)}`, detail: 'You said you sent a message. No one has confirmed they saw it yet.', tone: 'info' };
      return { title: `Alert saved at ${clock(i?.created_at)}`, detail: 'No one has confirmed they saw it yet. Send your message below.', tone: 'info' };
    default:
      return { title: '', detail: '', tone: 'info' };
  }
}

const LOCATION_PROBLEM: Record<string, string> = {
  denied: 'Location is switched off for this app.',
  timeout: 'Your phone took too long to find you.',
  unavailable: 'Your phone couldn’t find your location.',
  unsupported: 'This phone or browser can’t share a location.',
};

const rowClass = 'flex flex-col gap-2 border-t border-line py-3 first:border-t-0';
const linkBtn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[0.9375rem] font-bold text-ink no-underline hover:border-pri-text';

/** One support person: what has happened, and how to reach them. */
const ContactRow: React.FC<{ contact: UserContact; message: string; view: IncidentView; onRecord: (c: Channel, r: string, a: HandoffAction) => void }> = ({ contact, message, view, onRecord }) => {
  const name = firstName(contact);
  const key = isUuid(contact.id) ? contact.id! : 'unlinked';
  const find = (ch: Channel) => view.incident?.notifications.find(n => n.channel === ch && n.recipient_key === key);
  const sms = find('sms_handoff');
  const wa = find('whatsapp_handoff');
  const reported = [sms, wa].some(n => n?.status === 'reported_sent');
  const opened = [sms, wa].find(n => n?.status === 'opened');

  let status = 'Message not sent yet.';
  if (reported) status = 'You said you sent it. 4Life can’t see if it arrived.';
  else if (opened) status = `Your messaging app was opened at ${clock(opened.updated_at)}. Nothing is sent until you press send there.`;
  else if ([sms, wa].some(n => n?.status === 'reported_not_sent')) status = 'You said it wasn’t sent. Try again, or call them.';

  return (
    <li className={rowClass}>
      <p className="m-0 flex items-center gap-2 font-bold text-ink">
        <UserRound className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" /> {name}
      </p>
      <p className="m-0 text-[0.9375rem] text-ink-2" data-testid="contact-status">{status}</p>
      <div className="flex flex-wrap gap-2">
        <a href={smsHref(contact.phone, message)} onClick={() => onRecord('sms_handoff', key, 'opened')} className={linkBtn}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> Text {name}
        </a>
        <a href={whatsappHref(contact.phone, message)} target="_blank" rel="noopener noreferrer" onClick={() => onRecord('whatsapp_handoff', key, 'opened')} className={linkBtn}>
          WhatsApp
        </a>
        <a href={telHref(contact.phone)} onClick={() => onRecord('contact_call_handoff', key, 'opened')} className={linkBtn}>
          <Phone className="h-4 w-4" aria-hidden="true" /> Call
        </a>
      </div>
      {opened && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.9375rem] font-semibold text-ink">Did you press send?</span>
          <Button size="sm" variant="secondary" onClick={() => onRecord(opened.channel, key, 'reported_sent')}>
            Yes, I sent it
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onRecord(opened.channel, key, 'reported_not_sent')}>
            No
          </Button>
        </div>
      )}
    </li>
  );
};

export const EmergencyPanel: React.FC<{ profile: UserProfile; controller: IncidentController; view: IncidentView }> = ({ profile, controller, view }) => {
  const [typing, setTyping] = useState(false);
  const [note, setNote] = useState('');

  const contacts = [...(profile.contacts || [])].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));
  const myName = profile.nickname || profile.name || 'Your friend';
  const consent = !!profile.shareLocationInCrisis;
  const server = view.mode === 'server';
  const loc = view.location;
  const fix: Fix | null = loc.state === 'found' ? loc.fix : null;
  const manual = loc.state === 'manual' ? loc.note : undefined;
  const message = locationMessage(myName, fix, manual ? `I'm at: ${manual}.` : undefined);
  const counsellors = view.incident?.notifications.filter(n => n.channel === 'counsellor_in_app') || [];

  const record = (c: Channel, r: string, a: HandoffAction) => controller.record(c, r, a);

  // Before anything is pressed: say exactly what will happen
  if (view.phase === 'idle') {
    return (
      <section aria-labelledby="alert-h" className="flex flex-col gap-3 rounded-2xl border-2 border-danger bg-danger-soft p-4">
        <h3 id="alert-h" className="m-0 text-[1.1875rem] font-extrabold text-ink">
          Alert the people who support you
        </h3>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[0.9375rem] text-ink">
          {server && <li>Your counsellor, if you have one linked, sees an alert in their app{consent ? ', with your location' : '. Your location is not shared with them (change this in Settings)'}.</li>}
          {contacts.length > 0 ? (
            <li>A message to {contacts.map(firstName).join(', ')} gets ready, with your location if your phone can find it. You press send.</li>
          ) : (
            <li>You have no support person yet. You can add one in Settings.</li>
          )}
          <li>We’ll ask for your location now, and only use it for this alert.</li>
          <li className="font-bold">This does not contact an ambulance.</li>
        </ul>
        {server || contacts.length > 0 ? (
          <button type="button" onClick={() => controller.start()} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-lg font-extrabold text-[#fff] cursor-pointer hover:bg-danger-hover">
            <Send className="h-5 w-5" aria-hidden="true" /> Start alert
          </button>
        ) : null}
        {server || contacts.length > 0 ? <p className="m-0 text-sm text-ink-2">Pressed by mistake? You can cancel straight after.</p> : null}
      </section>
    );
  }

  const text = statusText(view);
  const live = view.phase === 'active';

  return (
    <section aria-label="Your alert" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div role={text.tone === 'danger' ? 'alert' : 'status'}>
        <Notice tone={text.tone} icon={text.tone === 'danger' || text.tone === 'warn' ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}>
          <p className="m-0 font-bold" data-testid="alert-status">{text.title}</p>
          <p className="m-0 mt-0.5">{text.detail}</p>
          {view.stale && live && <p className="m-0 mt-1 font-semibold">Can’t reach the server right now. Last confirmed at {clock(view.checkedAt)}, so this may be out of date.</p>}
        </Notice>
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {/* Never implied: 4Life isn't connected to emergency services */}
        <li className={rowClass}>
          <p className="m-0 font-bold text-ink">Emergency services</p>
          <p className="m-0 text-[0.9375rem] text-ink-2">4Life isn’t connected to them and can’t send an ambulance. Only a phone call reaches them.</p>
          {(view.phase === 'active' || view.phase === 'closed') && view.incident?.notifications.some(n => n.channel === 'emergency_call_handoff') && (
            <p className="m-0 text-[0.9375rem] text-ink-2">Your phone was opened to call. 4Life can’t see if the call connected.</p>
          )}
        </li>

        {server && live && (
          <li className={rowClass}>
            <p className="m-0 font-bold text-ink">Your counsellor</p>
            {counsellors.length === 0 ? (
              <p className="m-0 text-[0.9375rem] text-ink-2" data-testid="counsellor-status">You have no linked counsellor, so no one was alerted in the app.</p>
            ) : (
              counsellors.map(c => (
                <p key={c.recipient_key} className="m-0 text-[0.9375rem] text-ink-2" data-testid="counsellor-status">
                  {c.status === 'acknowledged' ? (
                    <>
                      <Check className="mr-1 inline h-4 w-4 align-[-2px] text-pri-text" aria-hidden="true" />
                      {c.recipient_name || 'Your counsellor'} saw it at {clock(c.acknowledged_at)}.
                    </>
                  ) : (
                    <>Alert saved for {c.recipient_name || 'your counsellor'}. They’ll see it when they next open 4Life, and they haven’t confirmed yet.</>
                  )}
                </p>
              ))
            )}
          </li>
        )}

        {(live || view.phase === 'submitting' || view.phase === 'unknown' || view.phase === 'offline' || view.phase === 'failed') && (
          <>
            <li className={rowClass}>
              <p className="m-0 flex items-center gap-2 font-bold text-ink">
                <MapPin className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" /> Your location
              </p>
              <p className="m-0 text-[0.9375rem] text-ink-2" data-testid="location-status">
                {loc.state === 'finding' && 'Looking for your location… This doesn’t hold up your alert.'}
                {loc.state === 'found' && (
                  <>
                    Found at {clock(loc.fix.at)}, accurate to about {loc.fix.accuracyM} m.
                    {!isFreshFix(loc.fix) && ' This may be out of date: find it again.'}
                    {server && !consent && ' Not shared with your counsellor, only in messages you send.'}
                    {server && consent && view.incident?.location_shared && counsellors.length > 0 && ' Your counsellor can see it.'}
                  </>
                )}
                {loc.state === 'manual' && <>You wrote: “{loc.note}”.{server && !consent && ' Only in messages you send.'}</>}
                {loc.state === 'problem' && `${LOCATION_PROBLEM[loc.problem]} Your message will say so. You can write a landmark instead.`}
                {loc.state === 'idle' && 'Not looked up yet.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {loc.state !== 'finding' && (
                  <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => controller.findLocation()}>
                    {loc.state === 'found' ? 'Find it again' : 'Try again'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setTyping(t => !t)} aria-expanded={typing}>
                  Write a landmark
                </Button>
              </div>
              {typing && (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={e => {
                    e.preventDefault();
                    controller.setManualLocation(note);
                    setTyping(false);
                  }}
                >
                  <Field label="Where are you?" htmlFor="alert-landmark" hint="An area and something nearby: a school, church, junction or shop.">
                    <input id="alert-landmark" value={note} maxLength={120} onChange={e => setNote(e.target.value)} className={inputClass} />
                  </Field>
                  <Button size="sm" type="submit" disabled={!note.trim()}>
                    Use this
                  </Button>
                </form>
              )}
            </li>

            {contacts.map(c => (
              <ContactRow key={c.id || c.phone} contact={c} message={message} view={view} onRecord={record} />
            ))}
          </>
        )}
      </ul>

      {view.closeFailed && (
        <Notice tone="warn">That didn’t reach the server, so your alert is still open. Please try again when you have a connection.</Notice>
      )}

      {live && (
        <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
          <Button variant="secondary" onClick={() => controller.close('resolved')}>
            I’m safe now
          </Button>
          <Button variant="ghost" onClick={() => controller.close('cancelled')}>
            Pressed by mistake
          </Button>
        </div>
      )}
      {(view.phase === 'closed' || view.phase === 'failed') && (
        <Button variant="secondary" onClick={() => controller.reset()}>
          Start again
        </Button>
      )}
    </section>
  );
};

/** Across the top of the app while an alert is open, so a refresh or a new screen never hides it. */
export const ActiveAlertBanner: React.FC<{ view: IncidentView; onOpen: () => void }> = ({ view, onOpen }) => {
  if (view.phase !== 'active' && view.phase !== 'unknown' && view.phase !== 'offline') return null;
  const text = statusText(view);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx('mb-4 flex w-full min-h-12 items-center gap-3 rounded-xl border-2 px-4 py-2 text-left font-bold cursor-pointer', view.phase === 'active' ? 'border-danger bg-danger-soft text-ink' : 'border-warn-bar bg-warn-soft text-ink')}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{text.title}</span>
      <span className="shrink-0 text-sm underline">Open</span>
    </button>
  );
};
