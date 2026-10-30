import React from 'react';
import { FileText, Hospital, Phone, ShieldAlert } from 'lucide-react';
import { Card, IconBadge, SectionHeader } from '../../components/ui';

const CRISIS_STEPS = [
  { title: 'Stay with them', text: 'Keep talking calmly. Do not end the call or session while they are in danger.' },
  { title: 'Ask directly', text: 'Ask plainly about thoughts of harming themselves or others, and about any plan or means.' },
  { title: 'Make it safer now', text: 'Agree steps to remove means and move to a safe place. Use their safety plan.' },
  { title: 'Bring in support', text: 'With their agreement, contact the support person on their safety plan.' },
  { title: 'Call for help if in immediate danger', text: 'Call 112, or 193 for an ambulance. You may need to act without consent when life is at risk — follow your professional code and the law.' },
  { title: 'Record and follow up', text: 'Write a note the same day, set the client’s risk level, and book a check-in within 24–48 hours.' },
];

const WORKSHEETS = [
  { title: 'Thought record', text: 'Situation → automatic thought → feeling → balanced thought. For cravings and low mood.' },
  { title: 'Urge log', text: 'Time, trigger, strength 0–10, what they did, how long the urge lasted.' },
  { title: 'Relapse prevention plan', text: 'High-risk situations, early warning signs and a step-by-step plan for each.' },
  { title: 'Safety plan', text: 'Warning signs, what helps, people to contact, and how to make the space safer.' },
  { title: 'Decisional balance', text: 'Pros and cons of changing and of staying the same — for motivational interviewing.' },
  { title: 'Weekly activity plan', text: 'Plan rewarding, substance-free activities for the hardest times of the week.' },
];

const REFERRALS = [
  { name: 'Accra Psychiatric Hospital', where: 'Accra', what: 'Psychiatric assessment, inpatient and outpatient care' },
  { name: 'Pantang Hospital', where: 'Accra', what: 'Psychiatric care, including substance use treatment' },
  { name: 'Ankaful Psychiatric Hospital', where: 'Cape Coast', what: 'Psychiatric assessment, inpatient and outpatient care' },
  { name: 'Mental Health Authority', where: 'National', what: 'Guidance on services and referrals across Ghana' },
];

/** What to do in a crisis, plus worksheets and places to refer clients. */
export const ResourcesTab: React.FC = () => (
  <div className="flex flex-col gap-8 animate-fadeIn">
    <Card as="section" tone="danger" aria-labelledby="r-crisis" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader id="r-crisis" title="If a client is at risk" subtitle="Follow these steps in order." />
        <div className="flex flex-wrap gap-2">
          <a href="tel:112" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-danger px-5 text-base font-bold text-[#fff] no-underline hover:bg-danger-hover">
            <Phone className="h-5 w-5" aria-hidden="true" /> Call 112
          </a>
          <a href="tel:193" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-base font-bold text-ink no-underline hover:bg-muted">
            <Phone className="h-5 w-5" aria-hidden="true" /> Ambulance 193
          </a>
        </div>
      </div>
      <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {CRISIS_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl bg-surface p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger text-sm font-bold text-[#fff]">{i + 1}</span>
            <span>
              <span className="block text-base font-bold text-ink">{s.title}</span>
              <span className="block text-[0.9375rem] leading-relaxed text-ink-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>

    <section aria-labelledby="r-ws" className="flex flex-col gap-4">
      <SectionHeader id="r-ws" title="Worksheets" subtitle="Common tools to use in sessions or set as homework." />
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {WORKSHEETS.map(w => (
          <li key={w.title}>
            <Card className="flex h-full gap-3">
              <IconBadge tone="info" size="sm">
                <FileText className="h-5 w-5" />
              </IconBadge>
              <span>
                <span className="block text-base font-bold text-ink">{w.title}</span>
                <span className="block text-[0.9375rem] leading-relaxed text-ink-2">{w.text}</span>
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </section>

    <section aria-labelledby="r-ref" className="flex flex-col gap-4">
      <SectionHeader id="r-ref" title="Where to refer" subtitle="For care beyond talking therapy. Check current contact details before referring." />
      <Card padded={false} className="divide-y divide-line">
        {REFERRALS.map(r => (
          <div key={r.name} className="flex items-start gap-3 p-5">
            <IconBadge tone="muted" size="sm">
              <Hospital className="h-5 w-5" />
            </IconBadge>
            <span>
              <span className="block text-base font-bold text-ink">{r.name}</span>
              <span className="block text-[0.9375rem] text-ink-2">
                {r.where} · {r.what}
              </span>
            </span>
          </div>
        ))}
      </Card>
    </section>

    <p className="m-0 flex items-start gap-2 text-sm text-ink-3">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      These steps are a quick reminder. They do not replace your training, your professional code, or local law.
    </p>
  </div>
);
