/**
 * Learn: short educational videos on recovery, CBT and calm, from YouTube.
 *
 * The list comes from /api/videos (YouTube Data API v3 on the server; the key never reaches the
 * browser). Topics, a search that stays inside the topic, "Show more", and a suggested topic from
 * what the person is working on. Nothing loads from YouTube until a video is played, and the player
 * is YouTube's privacy-enhanced one. Videos are for learning and never replace a counsellor.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, PlayCircle, Search, X, RefreshCw, GraduationCap } from 'lucide-react';
import type { UserProfile } from '../../types';
import { Badge, Button, Card, Chip, Notice, cx, inputClass } from '../ui';
import { PageHero } from '../PageHero';
import { apiFetch } from '../../lib/apiFetch';
import { VIDEO_CATEGORIES, formatDuration, videoCategory, type LibraryVideo } from '../../lib/videoLibrary';
import { t, T, msg } from '../../i18n';

/** A topic that suits what the person said they are working on */
const SUGGESTED: Record<string, string> = {
  substance: 'recovery',
  porn: 'habits',
  porn_social: 'habits',
  social_media: 'habits',
  anger: 'emotions',
  overeating: 'habits',
  general: 'stress',
};

type Load =
  | { status: 'loading' }
  | { status: 'ready'; videos: LibraryVideo[]; nextPage: string | null; more?: 'loading' | 'failed' }
  | { status: 'nokey' }
  | { status: 'failed'; message: string };

// Answers already fetched in this visit, so going back to a topic is instant
const memory = new Map<string, { videos: LibraryVideo[]; nextPage: string | null }>();

async function fetchVideos(category: string, q: string, page: string, signal: AbortSignal) {
  const params = new URLSearchParams({ category, ...(q ? { q } : {}), ...(page ? { page } : {}) });
  // a slow connection gets 15 seconds, then a clear message instead of an endless spinner
  const timeout = AbortSignal.timeout(15000);
  const res = await apiFetch(`/api/videos?${params}`, { signal: AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { videos: LibraryVideo[]; nextPage: string | null; keyMissing?: boolean; error?: string };
}

const youtubeSearch = (category: string, q: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} ${videoCategory(category)?.query || ''}`.trim())}`;

/** Placeholder cards with the same shape as the real ones, so nothing jumps when they arrive */
const Skeletons: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <li key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="aspect-video w-full animate-pulse bg-muted" />
        <div className="flex flex-col gap-2 p-4">
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </li>
    ))}
  </ul>
);

const VideoCard: React.FC<{ video: LibraryVideo }> = ({ video }) => {
  const [playing, setPlaying] = useState(false);
  const length = formatDuration(video.duration);
  const topic = videoCategory(video.category);
  const watchHref = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      {playing ? (
        <div className="relative aspect-video w-full bg-[#000]">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?autoplay=1&rel=0&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted"
          aria-label={t('Play: {title}', { title: video.title })}
        >
          {video.thumb && <img src={video.thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(0,0,0,0.62)] text-[#fff] transition-transform group-hover:scale-105">
              <PlayCircle className="h-7 w-7" aria-hidden="true" />
            </span>
          </span>
          {length && (
            <span className="absolute bottom-2 right-2 rounded-md bg-[rgba(0,0,0,0.75)] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#fff]">
              <span className="sr-only">{t('Length')} </span>
              {length}
            </span>
          )}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <h3 className="m-0 line-clamp-2 text-base font-bold leading-snug text-ink [overflow-wrap:anywhere]" title={video.title}>
          {video.title}
        </h3>
        {video.channel && <p className="m-0 truncate text-sm font-semibold text-ink-2">{video.channel}</p>}
        {video.description && <p className="m-0 line-clamp-2 text-sm leading-relaxed text-ink-3 [overflow-wrap:anywhere]">{video.description}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          {topic && <Badge tone="pri">{t(topic.label)}</Badge>}
          <a
            href={watchHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-pri-text no-underline hover:underline"
          >
            {t('Watch on YouTube')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </li>
  );
};

export const LearnTab: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const suggested = SUGGESTED[profile.currentTriage] || 'wellness';
  const [category, setCategory] = useState(suggested);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const moreCtrl = useRef<AbortController | null>(null);

  const key = `${category}|${query.toLowerCase()}`;
  useEffect(() => {
    const remembered = memory.get(key);
    if (remembered) {
      setLoad({ status: 'ready', ...remembered });
      return;
    }
    const ctrl = new AbortController();
    setLoad({ status: 'loading' });
    fetchVideos(category, query, '', ctrl.signal)
      .then(d => {
        if (d.keyMissing) return setLoad({ status: 'nokey' });
        if (d.error && !d.videos.length) return setLoad({ status: 'failed', message: d.error });
        memory.set(key, { videos: d.videos, nextPage: d.nextPage });
        setLoad({ status: 'ready', videos: d.videos, nextPage: d.nextPage });
      })
      .catch(e => {
        if (ctrl.signal.aborted) return;
        setLoad({
          status: 'failed',
          message: !navigator.onLine
            ? msg("You're offline. Videos need an internet connection.")
            : (e as Error).name === 'TimeoutError'
              ? msg('This is taking too long. Check your connection and try again.')
              : msg('Videos are not available right now. Please try again later.'),
        });
      });
    return () => ctrl.abort();
  }, [key, attempt]);

  const showMore = () => {
    if (load.status !== 'ready' || !load.nextPage) return;
    moreCtrl.current?.abort();
    const ctrl = (moreCtrl.current = new AbortController());
    setLoad({ ...load, more: 'loading' });
    fetchVideos(category, query, load.nextPage, ctrl.signal)
      .then(d => {
        // a page can repeat videos from the one before; each is shown once
        const seen = new Set(load.videos.map(v => v.id));
        const videos = [...load.videos, ...d.videos.filter(v => !seen.has(v.id))];
        memory.set(key, { videos, nextPage: d.nextPage });
        setLoad({ status: 'ready', videos, nextPage: d.error ? load.nextPage : d.nextPage, more: d.error ? 'failed' : undefined });
      })
      .catch(() => !ctrl.signal.aborted && setLoad({ ...load, more: 'failed' }));
  };
  useEffect(() => () => moreCtrl.current?.abort(), []);

  const topic = useMemo(() => videoCategory(category), [category]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        id="learn-h"
        className="py-5 sm:py-6"
        eyebrow={t('Learn')}
        title={t('Short videos to help you understand recovery')}
        text={t('Hand-picked topics: CBT skills, stress, anxiety, cravings and healthy habits, from YouTube.')}
      />

      <Notice icon={<GraduationCap className="h-5 w-5" />}>
        <T
          text="These videos are for learning. They don't replace a counsellor or treatment. In danger right now? Call <0>112</0>."
          parts={[<a href="tel:112" className="font-bold text-danger-text underline" />]}
        />
      </Notice>

      <Card className="flex flex-col gap-4">
        <form
          role="search"
          className="flex flex-wrap gap-2"
          onSubmit={e => {
            e.preventDefault();
            setQuery(typed.trim());
          }}
        >
          <label htmlFor="learn-search" className="sr-only">
            {t('Search videos')}
          </label>
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              id="learn-search"
              type="search"
              value={typed}
              maxLength={80}
              onChange={e => setTyped(e.target.value)}
              placeholder={t('Search in {topic}', { topic: t(topic?.label || '') })}
              className={cx(inputClass, 'pl-11')}
              enterKeyHint="search"
            />
          </div>
          <Button type="submit" icon={<Search className="h-5 w-5" />}>
            {t('Search')}
          </Button>
          {query && (
            <Button
              variant="ghost"
              icon={<X className="h-5 w-5" />}
              onClick={() => {
                setTyped('');
                setQuery('');
              }}
            >
              {t('Clear search')}
            </Button>
          )}
        </form>

        <div className="no-scrollbar fade-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="group" aria-label={t('Topics')}>
          {VIDEO_CATEGORIES.map(c => (
            <Chip
              key={c.id}
              selected={c.id === category}
              onClick={() => setCategory(c.id)}
              className="shrink-0"
              // on a phone the row scrolls: bring the suggested topic into view when the page opens
              ref={
                c.id === suggested
                  ? (el: HTMLButtonElement | null) => {
                      const row = el?.parentElement;
                      // only the row scrolls sideways; the page itself doesn't move
                      if (el && row && row.scrollWidth > row.clientWidth) row.scrollLeft = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
                    }
                  : undefined
              }
            >
              {t(c.label)}
              {c.id === suggested && <span className="text-xs font-bold opacity-80">· {t('Suggested')}</span>}
            </Chip>
          ))}
        </div>
      </Card>

      <section aria-labelledby="learn-list" aria-busy={load.status === 'loading'} className="flex flex-col gap-4">
        <h2 id="learn-list" className="m-0 text-lg font-bold text-ink">
          {query ? t('Results for “{query}” in {topic}', { query, topic: t(topic?.label || '') }) : t(topic?.label || '')}
        </h2>

        {load.status === 'loading' && (
          <>
            <p className="sr-only" role="status">
              {t('Loading videos…')}
            </p>
            <Skeletons />
          </>
        )}

        {load.status === 'nokey' && (
          <Notice tone="info">
            <p className="m-0 font-bold">{t("Videos can't be shown in the app yet.")}</p>
            <p className="m-0 mt-1">{t('You can still find this topic on YouTube.')}</p>
            <a href={youtubeSearch(category, query)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-pri-text">
              {t('Search on YouTube')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Notice>
        )}

        {load.status === 'failed' && (
          <Notice tone="warn">
            <p className="m-0">{t(load.message)}</p>
            <Button size="sm" variant="secondary" className="mt-2" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setAttempt(a => a + 1)}>
              {t('Try again')}
            </Button>
          </Notice>
        )}

        {load.status === 'ready' && load.videos.length === 0 && (
          <Notice tone="info">
            <p className="m-0">{query ? t('No videos found for this search. Try other words or another topic.') : t('No videos in this topic right now. Try another topic.')}</p>
          </Notice>
        )}

        {load.status === 'ready' && load.videos.length > 0 && (
          <>
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {load.videos.map(v => (
                <VideoCard key={v.id} video={v} />
              ))}
            </ul>
            {load.more === 'loading' && <Skeletons count={3} />}
            {load.more === 'failed' && (
              <p className="m-0 text-sm text-danger-text" role="alert">
                {t('Could not load more videos. Please try again.')}
              </p>
            )}
            {load.nextPage && load.more !== 'loading' && (
              <Button variant="secondary" className="self-center" onClick={showMore}>
                {t('Show more videos')}
              </Button>
            )}
          </>
        )}

        <p className="m-0 text-xs text-ink-3">{t('Videos and their descriptions come from YouTube and belong to their makers.')}</p>
      </section>
    </div>
  );
};
