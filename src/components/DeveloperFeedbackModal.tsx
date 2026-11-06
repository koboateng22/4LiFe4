import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { Modal, Tabs, Button, Field, Notice, inputClass, textareaClass } from './ui';
import { Send, Check, ChevronDown, MessageSquare, HelpCircle } from 'lucide-react';

import { t, msg } from '../i18n';
interface DeveloperFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
}

/** Set VITE_FEEDBACK_EMAIL in .env.local to send feedback to a real inbox. */
const FEEDBACK_EMAIL: string = ((import.meta as any).env?.VITE_FEEDBACK_EMAIL || '').trim();
const SAVED_KEY = '4life_feedback_v1';

const CATEGORIES = [msg('Something isn’t working'), msg('An idea to make it better'), msg('AI therapy'), msg('Global Village'), msg('Instant EMS'), msg('Something else')];

/* Honest answers about what the app does today */
const FAQS = [
  {
    q: msg('Who can see my AI therapy conversation?'),
    a: msg('Nobody else. Your conversation with the AI is saved on your phone only. Thought records are private too, unless you switch on “Share with my counsellor” for a record.'),
  },
  {
    q: msg('Is the AI a real therapist?'),
    a: msg('No. It is an AI that uses CBT skills to help with cravings and difficult thoughts. It does not replace a counsellor or emergency care. If you might be in danger, it shows you how to call 112 or alert your support person.'),
  },
  {
    q: msg('Does anyone in the Global Village know who I am?'),
    a: msg('Only your community name is shown. Please don’t share phone numbers, real names or places — the app blocks phone numbers and emails to help keep everyone anonymous.'),
  },
  {
    q: msg('What happens when I press “Send my location”?'),
    a: msg('Your phone’s own messaging app (SMS or WhatsApp) opens with a message and a map link. Nothing is sent until you press send there.'),
  },
  {
    q: msg('Does it work without internet?'),
    a: msg('After you have opened it once, the emergency page still opens offline: the call buttons, hotlines and the list of places work. AI replies, the Village and the map need internet.'),
  },
  {
    q: msg('Can I use the app in Twi, Ga, Ewe or Hausa?'),
    a: msg('Not yet. 4Life works in English and 26 other languages, from the language button at the top. Twi, Ga, Ewe, Hausa, Fante and Dagbani will come once native speakers have checked every word. Emergency steps are always shown in English, so nothing important gets lost in translation.'),
  },
];

interface SavedFeedback {
  id: string;
  at: string;
  category: string;
  subject: string;
  message: string;
}

export const DeveloperFeedbackModal: React.FC<DeveloperFeedbackModalProps> = ({ isOpen, onClose, profile }) => {
  const [tab, setTab] = useState<'send' | 'faq'>('send');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<'email' | 'saved' | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (isOpen) setSent(null);
  }, [isOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    const item: SavedFeedback = { id: String(Date.now()), at: new Date().toISOString(), category, subject: subject.trim(), message: message.trim() };
    try {
      const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
      localStorage.setItem(SAVED_KEY, JSON.stringify([item, ...list].slice(0, 50)));
    } catch {}
    if (FEEDBACK_EMAIL) {
      const body = `${item.message}\n\nCategory: ${category}\nFrom: ${profile.nickname || 'Anonymous'}`;
      window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('4Life: ' + item.subject)}&body=${encodeURIComponent(body)}`;
      setSent('email');
    } else setSent('saved');
    setSubject('');
    setMessage('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Ask the developers")} subtitle={t("Questions, problems and ideas help us make 4Life better.")} size="lg">
      <div className="flex flex-col gap-5">
        <Tabs<'send' | 'faq'>
          label={t("Feedback sections")}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'send', label: msg('Send feedback'), icon: <MessageSquare className="h-5 w-5" /> },
            { value: 'faq', label: msg('Questions'), icon: <HelpCircle className="h-5 w-5" /> },
          ]}
        />

        {tab === 'send' &&
          (sent ? (
            <Notice icon={<Check className="h-5 w-5" />}>
              <p className="m-0 font-bold">{sent === 'email' ? t("Your email app opened with your message ready to send.") : t("Thank you — your feedback is saved.")}</p>
              <p className="m-0 mt-1">
                {sent === 'email'
                  ? t("Press send there to reach the team.")
                  : t("It is saved on this device for the team to collect. Sending it straight to the team isn’t set up yet.")}
              </p>
              <Button variant="link" onClick={() => setSent(null)}>
                {t("Send something else")}
              </Button>
            </Notice>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label={t("What is it about?")} htmlFor="fb-cat">
                <select id="fb-cat" value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{t(c)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("Subject")} htmlFor="fb-subject">
                <input
                  id="fb-subject"
                  type="text"
                  maxLength={120}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={t("For example: The map doesn't load on my phone")}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label={t("Your message")} htmlFor="fb-msg" hint={t("Please don’t include anything private, such as phone numbers.")}>
                <textarea id="fb-msg" rows={5} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className={textareaClass} required />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" size="lg" icon={<Send className="h-5 w-5" />} disabled={!subject.trim() || !message.trim()}>
                  {t("Send feedback")}
                </Button>
              </div>
            </form>
          ))}

        {tab === 'faq' && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <li key={f.q} className="rounded-xl border border-line bg-surface">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-base font-bold text-ink cursor-pointer"
                  >
                    {t(f.q)}
                    <ChevronDown className={`h-5 w-5 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {open && <p className="m-0 border-t border-line px-4 py-3 text-[0.9375rem] leading-relaxed text-ink-2">{t(f.a)}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
};
