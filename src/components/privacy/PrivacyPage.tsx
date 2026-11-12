/**
 * The Privacy Policy page, at /privacy. Open to everyone (no sign-in), in the app's light, dark and
 * system themes (applied by index.html before anything loads).
 *
 * The words live in src/content/privacyPolicy.ts; this file only lays them out: a summary, a table of
 * contents (beside the text on a computer, folded away on a phone), a search, and the sections.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, ChevronDown, Info, Leaf, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cx } from '../ui';
import { CONTACT_PLACEHOLDER, POLICY, hasPending, privacyContacts, type Block, type ContactKey, type PolicySection } from '../../content/privacyPolicy';
import { getLanguage, t } from '../../i18n';

const contacts = privacyContacts();
const missingContacts = (Object.keys(contacts) as ContactKey[]).filter(k => !contacts[k] && k !== 'dpo' && k !== 'dpcReg');

/** **bold**, [text](url) and {{contact}} → React */
function Inline({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\{\{(\w+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++} className="font-bold text-ink"><Inline text={m[1]} /></strong>);
    else if (m[2] !== undefined) {
      const external = /^https?:/.test(m[3]);
      out.push(
        <a key={i++} href={m[3]} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="font-semibold text-pri-text underline underline-offset-2 hover:no-underline">
          {m[2]}
        </a>
      );
    } else if (m[4] !== undefined) {
      const key = m[4] as ContactKey;
      const value = contacts[key];
      if (value && key === 'email')
        out.push(
          <a key={i++} href={`mailto:${value}`} className="font-semibold text-pri-text underline underline-offset-2 hover:no-underline">
            {value}
          </a>
        );
      else if (value) out.push(<span key={i++}>{value}</span>);
      else
        out.push(
          <mark key={i++} data-placeholder={key} className="rounded bg-warn-soft px-1 font-semibold text-warn">
            [{CONTACT_PLACEHOLDER[key] || key}]
          </mark>
        );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Plain words of a block, for the search */
const plain = (b: Block) =>
  ('p' in b ? b.p : 'callout' in b ? b.callout : 'pending' in b ? b.pending : 'list' in b ? b.list.join(' ') : [...b.table.head, ...b.table.rows.flat()].join(' '))
    .replace(/\*\*|\[|\]\([^)]*\)/g, '')
    .toLowerCase();

const BlockView: React.FC<{ block: Block }> = ({ block }) => {
  if ('p' in block) return <p className="m-0"><Inline text={block.p} /></p>;
  if ('list' in block)
    return (
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5 marker:text-pri">
        {block.list.map((item, i) => (
          <li key={i}><Inline text={item} /></li>
        ))}
      </ul>
    );
  if ('callout' in block)
    return (
      <p className="m-0 flex gap-3 rounded-2xl border border-pri/30 bg-pri-soft px-4 py-3.5 text-ink">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-pri-text" aria-hidden="true" />
        <span><Inline text={block.callout} /></span>
      </p>
    );
  if ('pending' in block)
    return (
      <p className="m-0 flex gap-3 rounded-2xl border border-warn/40 bg-warn-soft px-4 py-3.5 text-[0.9375rem] text-ink" data-pending="true">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
        <span>
          <strong className="font-bold text-warn">{t('To be confirmed:')}</strong> <Inline text={block.pending} />
        </span>
      </p>
    );
  const { head, rows } = block.table;
  const labelled = head.some(Boolean);
  return (
    <>
      {/* Computers and tablets: a table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line sm:block">
        <table className="w-full border-collapse text-left text-[0.9375rem]">
          {labelled && (
            <thead className="bg-muted text-sm text-ink">
              <tr>
                {head.map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line align-top first:border-t-0">
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="w-[26%] px-4 py-3 font-bold text-ink"><Inline text={c} /></th>
                  ) : (
                    <td key={j} className="px-4 py-3 text-ink-2"><Inline text={c} /></td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: one card per row, every cell labelled */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 sm:hidden">
        {rows.map((r, i) => (
          <li key={i} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="m-0 font-bold text-ink"><Inline text={r[0]} /></p>
            {r.slice(1).map((c, j) => (
              <p key={j} className="m-0 mt-1.5 text-[0.9375rem] text-ink-2">
                {labelled && head[j + 1] && <span className="block text-xs font-bold uppercase tracking-wide text-ink-3">{head[j + 1]}</span>}
                <Inline text={c} />
              </p>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
};

const Contents: React.FC<{ sections: PolicySection[]; onPick?: () => void }> = ({ sections, onPick }) => (
  <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
    {sections.map(s => (
      <li key={s.id}>
        <a href={`#${s.id}`} onClick={onPick} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.9375rem] text-ink-2 hover:bg-muted hover:text-ink">
          <span className="w-6 shrink-0 text-right text-sm font-bold text-ink-3">{POLICY.sections.indexOf(s) + 1}</span>
          <span>{s.title}</span>
        </a>
      </li>
    ))}
  </ol>
);

export default function PrivacyPage() {
  const [query, setQuery] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? POLICY.sections.filter(s => s.title.toLowerCase().includes(q) || s.blocks.some(b => plain(b).includes(q))) : POLICY.sections),
    [q]
  );
  const updated = new Date(POLICY.lastUpdated + 'T12:00:00Z').toLocaleDateString((getLanguage() || 'en') === 'en' ? 'en-GB' : getLanguage(), { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    const before = document.title;
    document.title = `${t('Privacy Policy')} · 4Life`;
    const meta = document.querySelector('meta[name="description"]');
    const desc = meta?.getAttribute('content');
    meta?.setAttribute('content', 'How 4Life collects, uses, stores and shares personal information, and the rights you have.');
    // Opened at a section (/privacy#ai-processing): go there once the page is drawn
    if (window.location.hash) requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
    return () => {
      document.title = before;
      if (desc) meta?.setAttribute('content', desc);
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a href="#policy" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-bold">
        {t('Skip to the policy')}
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 rounded-xl" aria-label={t('4Life home')}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pri text-[#fff]" aria-hidden="true">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-xl font-extrabold tracking-tight" translate="no">4Life</span>
          </a>
          <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[0.9375rem] font-semibold text-ink hover:border-pri-text">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('Back to 4Life')}
          </a>
        </div>
      </header>

      <main id="policy" className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <div className="max-w-3xl">
          <p className="m-0 inline-flex items-center gap-2 rounded-full bg-pri-soft px-3 py-1 text-sm font-bold text-pri-ink">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {t('Your privacy')}
          </p>
          <h1 className="mb-0 mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{t('Privacy Policy')}</h1>
          <p className="mb-0 mt-3 text-[0.9375rem] text-ink-3">
            {t('Last updated {date}', { date: updated })} · {t('Version {version}', { version: POLICY.version })}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {POLICY.status === 'draft' && (
              <p className="m-0 flex gap-3 rounded-2xl border border-warn/40 bg-warn-soft px-4 py-3.5 text-[0.9375rem]" role="note">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
                <span>
                  <strong className="font-bold">{t('Draft under review.')}</strong>{' '}
                  {hasPending() ? t('This policy describes how 4Life works today. A few points are still being confirmed and are marked “To be confirmed”.') : t('This policy describes how 4Life works today and is being reviewed.')}
                </span>
              </p>
            )}
            {missingContacts.length > 0 && (
              <p className="m-0 text-sm text-ink-3" data-testid="missing-contacts">
                {t('Some contact details have not been added yet. They are marked in the text.')}
              </p>
            )}
            {(getLanguage() || 'en') !== 'en' && <p className="m-0 text-[0.9375rem] text-ink-2">{t('This Privacy Policy is available in English only for now.')}</p>}
          </div>

          {/* In short */}
          <section aria-labelledby="in-short" className="mt-8 rounded-3xl border border-line bg-surface p-5 shadow-[0_1px_3px_rgba(15,35,26,0.06)] sm:p-7">
            <h2 id="in-short" className="m-0 text-lg font-bold">{t('In short')}</h2>
            <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0 text-[0.9375rem] leading-relaxed text-ink-2">
              {POLICY.summary.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-pri" aria-hidden="true" />
                  <span><Inline text={s} /></span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
          {/* Contents: beside the text on a computer, folded on a phone */}
          <nav aria-label={t('Contents')} className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
            <label className="relative block">
              <span className="sr-only">{t('Search the policy')}</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('Search the policy')}
                className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-[0.9375rem] text-ink placeholder:text-ink-3 focus:border-pri-text focus:outline-none"
              />
            </label>
            <div className="mt-3 lg:hidden">
              <button
                type="button"
                aria-expanded={tocOpen}
                onClick={() => setTocOpen(o => !o)}
                className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-surface px-4 text-[0.9375rem] font-bold"
              >
                {t('Contents')}
                <ChevronDown className={cx('h-5 w-5 transition-transform', tocOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {tocOpen && (
                <div className="mt-2 rounded-xl border border-line bg-surface p-2">
                  <Contents sections={shown} onPick={() => setTocOpen(false)} />
                </div>
              )}
            </div>
            <div className="mt-4 hidden lg:block">
              <p className="m-0 mb-2 px-2.5 text-xs font-bold uppercase tracking-wide text-ink-3">{t('Contents')}</p>
              <Contents sections={shown} />
            </div>
          </nav>

          <div className="min-w-0">
            {q && (
              <p className="m-0 mb-6 text-[0.9375rem] text-ink-2" role="status">
                {shown.length ? t('{n} sections mention “{q}”.', { n: shown.length, q: query.trim() }) : t('No section mentions “{q}”.', { q: query.trim() })}
              </p>
            )}
            <div className="flex flex-col gap-12">
              {shown.map(s => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
                  <h2 id={`${s.id}-title`} className="m-0 flex items-baseline gap-3 text-xl font-bold leading-snug sm:text-2xl">
                    <span className="text-base font-extrabold text-pri-text">{POLICY.sections.indexOf(s) + 1}.</span>
                    {s.title}
                  </h2>
                  <div className="mt-4 flex max-w-3xl flex-col gap-4 text-base leading-relaxed text-ink-2">
                    {s.blocks.map((b, i) => (
                      <BlockView key={i} block={b} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <p className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-ink-3">
              <span>
                {t('In an emergency call {a} or the ambulance on {b}.', { a: '112', b: '193' })}
              </span>
              <a href="#policy" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-pri-text hover:underline">
                <ArrowUp className="h-4 w-4" aria-hidden="true" /> {t('Back to top')}
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
