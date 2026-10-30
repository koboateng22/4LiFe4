/**
 * First aid while you wait for the ambulance.
 *
 * The steps ship with the app, so they open offline. Each topic also offers videos:
 * with YOUTUBE_API_KEY set on the server, a few safe-search videos play inside the app
 * (they load only when tapped, to save data); without it, a button opens the search on YouTube.
 */
import React, { useEffect, useState } from 'react';
import { Ban, ChevronRight, Droplet, ExternalLink, Flame, Hand, HeartPulse, Phone, PersonStanding, Pill, PlayCircle, Wine, Zap } from 'lucide-react';
import { FIRST_AID, youtubeSearchHref, type FirstAidTopic } from '../../lib/firstAid';
import { apiFetch } from '../../lib/apiFetch';
import { useAction } from '../../lib/actions';
import { ButtonLink, Modal, SectionHeader, cx } from '../ui';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  overdose: Pill,
  cpr: HeartPulse,
  choking: Hand,
  bleeding: Droplet,
  burns: Flame,
  seizure: Zap,
  alcohol: Wine,
  fainting: PersonStanding,
};

interface Video {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

type VideoState = { status: 'loading' } | { status: 'ready'; videos: Video[] } | { status: 'none' };

/** Answers are kept for the visit, so reopening a topic doesn't spend data again */
const videoCache = new Map<string, Video[]>();

function useVideos(topic: FirstAidTopic | null): VideoState {
  const [state, setState] = useState<VideoState>({ status: 'none' });

  useEffect(() => {
    if (!topic) return;
    const hit = videoCache.get(topic.id);
    if (hit) {
      setState(hit.length ? { status: 'ready', videos: hit } : { status: 'none' });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState({ status: 'none' });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    apiFetch(`/api/first-aid/videos?topic=${encodeURIComponent(topic.id)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : { videos: [] }))
      .then((d: { videos?: Video[] }) => {
        const videos = Array.isArray(d.videos) ? d.videos.filter(v => /^[\w-]{6,20}$/.test(v.id)) : [];
        videoCache.set(topic.id, videos);
        setState(videos.length ? { status: 'ready', videos } : { status: 'none' });
      })
      .catch(e => {
        if ((e as Error).name !== 'AbortError') setState({ status: 'none' });
      });
    return () => ctrl.abort();
  }, [topic]);

  return state;
}

/** A compact row that becomes the player when tapped (nothing loads from YouTube before that) */
const VideoCard: React.FC<{ video: Video }> = ({ video }) => {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <li className="overflow-hidden rounded-xl border border-line bg-bg sm:col-span-2">
        <div className="relative aspect-video w-full bg-[#000]">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <p className="m-0 px-3 py-2.5 text-sm font-bold leading-snug text-ink">{video.title}</p>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-bg p-2 text-left transition-colors hover:border-pri-text"
      >
        <span className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {video.thumb && <img src={video.thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(0,0,0,0.62)] text-[#fff]">
            <PlayCircle className="h-5 w-5" aria-hidden="true" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-sm font-bold leading-snug text-ink">{video.title}</span>
          {video.channel && <span className="mt-0.5 block truncate text-xs text-ink-3">{video.channel}</span>}
          <span className="sr-only">Play video</span>
        </span>
      </button>
    </li>
  );
};

const TopicSheet: React.FC<{ topic: FirstAidTopic | null; onClose: () => void }> = ({ topic, onClose }) => {
  const videos = useVideos(topic);
  if (!topic) return null;

  return (
    <Modal isOpen={!!topic} onClose={onClose} title={topic.title} subtitle={topic.when} size="md">
      <div className="flex flex-col gap-5">
        {topic.callFirst && (
          <div className="flex flex-col gap-3 rounded-xl bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-[0.9375rem] font-bold leading-snug text-ink">Call for help first, then do these steps.</p>
            <ButtonLink href="tel:112" variant="danger" size="md" icon={<Phone className="h-4 w-4" />} className="shrink-0">
              Call 112
            </ButtonLink>
          </div>
        )}

        <section aria-label="Steps">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {topic.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pri-soft text-sm font-extrabold text-pri-ink" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[1rem] leading-relaxed text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {topic.avoid && topic.avoid.length > 0 && (
          <section aria-label="Don't" className="rounded-xl border border-line p-4">
            <p className="m-0 mb-2 text-sm font-bold uppercase tracking-wide text-ink-3">Don’t</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {topic.avoid.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
                  <Ban className="mt-1 h-4 w-4 shrink-0 text-danger-text" aria-hidden="true" />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="fa-videos" className="flex flex-col gap-3">
          <h3 id="fa-videos" className="m-0 text-base font-bold text-ink">
            Watch how it’s done
          </h3>
          {videos.status === 'loading' && (
            <div role="status" aria-label="Loading videos" className="grid gap-2 sm:grid-cols-2">
              <div className="h-[4.5rem] animate-pulse rounded-xl bg-muted" />
              <div className="h-[4.5rem] animate-pulse rounded-xl bg-muted" />
            </div>
          )}
          {videos.status === 'ready' && (
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {videos.videos.map(v => (
                <VideoCard key={v.id} video={v} />
              ))}
            </ul>
          )}
          <ButtonLink
            href={youtubeSearchHref(topic)}
            target="_blank"
            rel="noopener noreferrer"
            variant={videos.status === 'ready' ? 'ghost' : 'secondary'}
            icon={<PlayCircle className="h-5 w-5 text-danger-text" />}
            className={cx('self-start', videos.status === 'ready' && '-ml-4')}
          >
            {videos.status === 'ready' ? 'More on YouTube' : 'Watch on YouTube'}
            <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </ButtonLink>
          <p className="m-0 text-xs leading-relaxed text-ink-3">
            Videos need internet and use data. General first-aid guidance: always follow what the 112 call handler tells you.
          </p>
        </section>
      </div>
    </Modal>
  );
};

export const FirstAidSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const topic = FIRST_AID.find(t => t.id === openId) || null;
  useAction('first-aid', () => document.getElementById('first-aid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  return (
    <section id="first-aid" aria-labelledby="fa-h" className="flex scroll-mt-24 flex-col gap-4">
      <SectionHeader id="fa-h" title="First aid while you wait" subtitle="Simple steps that work offline. Tap one to open it." />
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 min-[380px]:grid-cols-2 lg:grid-cols-4">
        {FIRST_AID.map(t => {
          const Icon = ICONS[t.id] || HeartPulse;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className={cx(
                  'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors hover:border-pri-text',
                  t.callFirst ? 'border-[color-mix(in_oklab,var(--color-danger)_35%,var(--color-line))]' : 'border-line'
                )}
              >
                <Icon className={cx('h-5 w-5 shrink-0', t.callFirst ? 'text-danger-text' : 'text-pri-text')} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-bold leading-snug text-ink">{t.title}</span>
                  {t.callFirst && <span className="block text-xs font-bold text-danger-text">Call 112 first</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <TopicSheet topic={topic} onClose={() => setOpenId(null)} />
    </section>
  );
};
