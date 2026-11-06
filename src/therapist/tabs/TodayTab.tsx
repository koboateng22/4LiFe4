import React from 'react';
import { AlertTriangle, ArrowRight, CalendarPlus, Check, ClipboardList, FileText, Inbox, ShieldCheck, TrendingUp, UserX } from 'lucide-react';
import { Badge, Button, Card, IconBadge, Notice, SectionHeader } from '../../components/ui';
import type { TherapistProfile } from '../types';
import type { TherapistStore } from '../useTherapistStore';
import type { TherapistNav } from '../TherapistApp';
import { FORMAT_LABEL, ago, SESSION_TYPE_LABEL, fmtDateLong, fmtDay, fmtTime, focusLabel, greeting, sameDay } from '../data';
import { PageHero } from '../../components/PageHero';
import { CaseloadIllustration } from '../../components/auth/AuthIllustrations';
import { FormatIcon, RiskBadge, SessionRow, missedCheckins, needsNote, trend } from '../parts';

import { t, msg } from '../../i18n';
interface Props {
  therapist: TherapistProfile;
  store: TherapistStore;
  nav: TherapistNav;
}

export const TodayTab: React.FC<Props> = ({ therapist, store, nav }) => {
  const { clients, sessions } = store.data;
  const now = new Date();
  const clientOf = (id: string) => clients.find(c => c.id === id);

  const today = sessions.filter(s => sameDay(new Date(s.start), now)).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = sessions
    .filter(s => (s.status === 'scheduled' || s.status === 'in_progress') && new Date(s.start).getTime() + s.durationMin * 60000 > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming.find(s => s.status === 'in_progress') || upcoming[0];
  const nextClient = next ? clientOf(next.clientId) : undefined;
  const notesToFinish = sessions.filter(needsNote);
  const newRequests = store.requests.filter(r => r.status === 'new');
  const weekEnd = Date.now() + 7 * 86400000;
  const thisWeek = sessions.filter(s => s.status === 'scheduled' && new Date(s.start).getTime() < weekEnd && new Date(s.start).getTime() > Date.now()).length;
  const activeClients = clients.filter(c => c.status === 'active').length;
  const leftToday = today.filter(s => s.status === 'in_progress' || (s.status === 'scheduled' && new Date(s.start).getTime() + s.durationMin * 60000 > Date.now())).length;

  // Things that need the therapist's attention, most serious first
  type Alert = { key: string; tone: 'danger' | 'warn' | 'info'; icon: React.ReactNode; title: string; detail: string; action: string; onClick: () => void };
  const alerts: Alert[] = [];
  clients.forEach(c => {
    if (c.status !== 'active') return;
    if (c.risk === 'high')
      alerts.push({ key: c.id + 'r', tone: 'danger', icon: <AlertTriangle className="h-5 w-5" />, title: t('{name} is marked high risk', { name: c.nickname }), detail: c.lastLocation && c.locationConsent ? t('Location shared {when}. See the nearest emergency services.', { when: ago(c.lastLocation.at) }) : t('Review the safety plan and consider a check-in call.'), action: msg('Safety map'), onClick: () => nav.openSafety(c.id) });
    const tr = c.sharesCheckins ? trend(c.craving) : null;
    if (tr != null && tr >= 1.5)
      alerts.push({ key: c.id + 'c', tone: 'warn', icon: <TrendingUp className="h-5 w-5" />, title: t('{name}: cravings rising', { name: c.nickname }), detail: t('About {points} points higher than the week before.', { points: tr.toFixed(1) }), action: msg('See trend'), onClick: () => nav.openClient(c.id) });
    if (c.sharesCheckins && missedCheckins(c.craving) >= 2)
      alerts.push({ key: c.id + 'm', tone: 'warn', icon: <UserX className="h-5 w-5" />, title: t('{name} missed {count} check-ins', { name: c.nickname, count: missedCheckins(c.craving) }), detail: msg('In the last 7 days.'), action: msg('Open client'), onClick: () => nav.openClient(c.id) });
  });
  notesToFinish.forEach(s =>
    alerts.push({ key: s.id, tone: 'info', icon: <FileText className="h-5 w-5" />, title: t('Finish notes for {name}', { name: clientOf(s.clientId)?.nickname }), detail: t('{day}, {time} session', { day: fmtDay(s.start), time: fmtTime(s.start) }), action: msg('Write notes'), onClick: () => nav.openSession(s.id) })
  );
  const order = { danger: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.tone] - order[b.tone]);

  const isNew = clients.length === 0;
  const minsToNext = next ? Math.round((new Date(next.start).getTime() - Date.now()) / 60000) : 0;

  return (
    <div className="flex flex-col gap-8 animate-fadeIn">
      {/* Greeting */}
      <PageHero
        id="t-greet"
        className="py-5 sm:py-6"
        eyebrow={fmtDateLong(now.toISOString())}
        title={
          <>
            {greeting()}, {therapist.title ? `${therapist.title} ${therapist.name.split(' ').slice(-1)[0]}` : therapist.name.split(' ')[0]}
          </>
        }
        text={
          isNew
            ? t('Welcome to your workspace.')
            : newRequests.length
              ? `${t('{count} sessions left today', { count: leftToday })} · ${t('{count} new requests', { count: newRequests.length })}`
              : t('{count} sessions left today', { count: leftToday })
        }
        art={<CaseloadIllustration />}
      />

      {therapist.verification === 'pending' && (
        <Notice tone="info" icon={<ShieldCheck className="h-5 w-5" />}>
          <p className="m-0 font-bold">{t("We are checking your licence")}</p>
          <p className="m-0 mt-1">
            {t("This usually takes 2–3 working days. Until then your profile is hidden from clients. You can set up your hours and explore the workspace.")}
          </p>
        </Notice>
      )}

      {/* First-run checklist for new therapists */}
      {isNew && (
        <Card as="section" aria-labelledby="t-start" className="flex flex-col gap-4">
          <SectionHeader id="t-start" title={t("Get ready for your first client")} subtitle={t("Four short steps.")} />
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {[
              { done: therapist.verification === 'verified', title: msg('Licence check'), detail: therapist.verification === 'verified' ? msg('Verified') : msg('In progress — nothing to do'), go: undefined },
              { done: false, title: msg('Confirm your hours'), detail: `${therapist.days.join(', ')} · ${therapist.startTime}–${therapist.endTime}`, go: () => nav.go('availability') },
              { done: false, title: msg('Check what clients see'), detail: msg('Your introduction, approaches and fee'), go: () => nav.go('profile') },
              { done: false, title: msg('Read the crisis steps'), detail: msg('What to do if a client is at risk'), go: () => nav.go('resources') },
            ].map((s, i) => (
              <li key={s.title} className="flex items-center gap-4 rounded-xl border border-line px-4 py-3">
                <span className={s.done ? 'flex h-8 w-8 items-center justify-center rounded-full bg-pri text-[#fff]' : 'flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold text-ink-2'}>
                  {s.done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-ink">{t(s.title)}</span>
                  <span className="block text-sm text-ink-3">{t(s.detail)}</span>
                </span>
                {s.go && (
                  <Button variant="secondary" size="sm" onClick={s.go}>
                    {t("Open")}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Next session */}
      {next && nextClient && (
        <Card as="section" aria-labelledby="t-next" raised className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 text-sm font-bold text-pri-text">
                {next.status === 'in_progress' ? t("In progress now") : minsToNext <= 0 ? t("Starting now") : minsToNext < 90 ? t("Next session · in {minsToNext} min", { minsToNext }) : t("Next session · {v0}", { v0: fmtDay(next.start) })}
              </p>
              <h2 id="t-next" className="m-0 mt-1 text-xl font-bold text-ink sm:text-[1.375rem]">
                {nextClient.nickname}
              </h2>
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink-2">
                <span className="font-semibold text-ink">{fmtTime(next.start)}</span>
                <span aria-hidden="true">·</span>
                <span>{SESSION_TYPE_LABEL[next.type]}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <FormatIcon format={next.format} /> {FORMAT_LABEL[next.format]}
                </span>
              </p>
            </div>
            <RiskBadge risk={nextClient.risk} />
          </div>

          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-bg p-3.5">
              <dt className="text-sm text-ink-3">{t("Focus")}</dt>
              <dd className="m-0 text-base font-bold text-ink">{focusLabel(nextClient.focus)}</dd>
            </div>
            <div className="rounded-xl bg-bg p-3.5">
              <dt className="text-sm text-ink-3">{t("Clean streak")}</dt>
              <dd className="m-0 text-base font-bold text-ink">{t("{streakDays} days", { streakDays: nextClient.streakDays })}</dd>
            </div>
            <div className="rounded-xl bg-bg p-3.5">
              <dt className="text-sm text-ink-3">{t("Today’s topic")}</dt>
              <dd className="m-0 text-base font-bold text-ink">{next.topic || t("Not set yet")}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => nav.openSession(next.id)} icon={<ClipboardList className="h-5 w-5" />}>
              {next.status === 'in_progress' ? t("Return to session") : t("Prepare and start")}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => nav.openClient(nextClient.id)}>
              {t("View client")}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Today's schedule */}
        <Card as="section" aria-labelledby="t-sched" className="flex flex-col gap-3">
          <SectionHeader
            id="t-sched"
            title={t("Today’s schedule")}
            size="md"
            action={
              <Button variant="link" onClick={() => nav.go('sessions')}>
                {t("All sessions")} <ArrowRight className="h-4 w-4" />
              </Button>
            }
          />
          {today.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-bg p-5">
              <p className="m-0 text-base text-ink-2">{t("No sessions today.")}</p>
              <Button variant="secondary" icon={<CalendarPlus className="h-5 w-5" />} onClick={() => nav.go('sessions')}>
                {t("Book a session")}
              </Button>
            </div>
          ) : (
            <div className="-mx-3 flex flex-col divide-y divide-line">
              {today.map(s => (
                <SessionRow key={s.id} session={s} client={clientOf(s.clientId)} onOpen={() => nav.openSession(s.id)} />
              ))}
            </div>
          )}
        </Card>

        {/* Needs attention */}
        <Card as="section" aria-labelledby="t-attn" className="flex flex-col gap-3">
          <SectionHeader id="t-attn" title={t("Needs your attention")} size="md" />
          {newRequests.length > 0 && (
            <button
              type="button"
              onClick={() => nav.go('requests')}
              className="flex items-center gap-3 rounded-xl bg-pri-soft px-4 py-3 text-left text-pri-ink hover:brightness-95 cursor-pointer"
            >
              <Inbox className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-[0.9375rem] font-bold">
                {t("{length} new session", { length: newRequests.length })} {newRequests.length === 1 ? 'request' : 'requests'}
              </span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          {alerts.length === 0 && newRequests.length === 0 ? (
            <p className="m-0 rounded-xl bg-bg p-5 text-base text-ink-2">{t("Nothing needs you right now.")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {alerts.slice(0, 6).map(a => (
                <li key={a.key}>
                  <button type="button" onClick={a.onClick} className="flex w-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-pri-text cursor-pointer">
                    <IconBadge tone={a.tone} size="sm">
                      {a.icon}
                    </IconBadge>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-bold text-ink">{t(a.title)}</span>
                      <span className="block text-sm text-ink-3">{t(a.detail)}</span>
                    </span>
                    <span className="shrink-0 self-center text-sm font-bold text-pri-text">{a.action}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Week in numbers */}
      {!isNew && (
        <section aria-label={t("This week")} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: msg('Active clients'), value: activeClients, go: () => nav.go('clients') },
            { label: msg('Sessions in the next 7 days'), value: thisWeek, go: () => nav.go('sessions') },
            { label: msg('Notes to finish'), value: notesToFinish.length, go: () => nav.go('sessions') },
            { label: msg('New requests'), value: newRequests.length, go: () => nav.go('requests') },
          ].map(s => (
            <button key={s.label} type="button" onClick={s.go} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 text-left hover:border-pri-text cursor-pointer">
              <span className="text-3xl font-extrabold text-ink">{s.value}</span>
              <span className="text-[0.9375rem] text-ink-2">{t(s.label)}</span>
            </button>
          ))}
        </section>
      )}

      {!isNew && (
        <p className="m-0 text-sm text-ink-3">
          <Badge tone="muted">{t("Tip")}</Badge> {t("Risk flags come from check-ins clients choose to share. They support your judgement — they do not replace it.")}
        </p>
      )}
    </div>
  );
};
