import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Headphones, WifiOff } from 'lucide-react';
import { Button, Card, ErrorState, ProgressBar, Skeleton, Spinner } from '@/components/ui';
import { COPY, LINES } from '@/lib/copy/fa';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductImage } from '@/components/common/ProductImage';
import { QueryState } from '@/components/common/QueryState';
import { MentorLauncher } from '@/components/learning/MentorSheet';
import { api, fileUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { clock, faDuration, faPercent } from '@/lib/format';
import { qk } from '@/lib/queries';
import { track } from '@/lib/telemetry';
import { loadYouTube, usePlaybackTracker, type YTPlayer } from '@/lib/tracker';
import type { ProgressResult, SectionDetail, SectionMedia } from '@/lib/types';

/** M6 — پلیر قسمت: audio/video file or YouTube; tracking via playedDeltaSec only. */
export function SectionPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: qk.section(id),
    queryFn: ({ signal }) => api.get<SectionDetail>(`/me/sections/${id}`, signal),
  });
  return (
    <QueryState
      query={q}
      loading={
        <div className="flex flex-col gap-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      }
    >
      {(d) => <Player key={d.section.id} d={d} />}
    </QueryState>
  );
}

function Player({ d }: { d: SectionDetail }) {
  const { section: s, package: p } = d;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [progress, setProgress] = useState({ percent: s.percent, completed: s.mediaCompleted });
  const [pos, setPos] = useState(s.lastPositionSec);
  const [dur, setDur] = useState(s.durationSec);
  const media = useQuery({
    queryKey: ['me', 'media', s.id],
    queryFn: ({ signal }) => api.get<SectionMedia>(`/me/sections/${s.id}/media`, signal),
    // Signed URLs expire after four hours; do not reuse a cached URL on a later visit.
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 1,
  });

  const onResult = (r: ProgressResult) => {
    setProgress((prev) => {
      if (!prev.completed && r.completed) {
        void qc.invalidateQueries({ queryKey: ['me'] });
      }
      return {
        percent: Math.max(prev.percent, r.percent),
        completed: prev.completed || r.completed,
      };
    });
  };
  const tracker = usePlaybackTracker(s.id, onResult);

  const quizReady = !s.quizPassed;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={s.title}
        back={`/packages/${p.id}`}
        subtitle={
          <span>
            {p.title} •{' '}
            {LINES.sectionOf(toPersianDigits(d.position.index), toPersianDigits(d.position.total))}
          </span>
        }
      />
      <div className="lg:flex lg:gap-6">
        <div className="flex flex-col gap-4 lg:flex-1">
          {media.isPending ? (
            <Skeleton className={cn('w-full', s.mediaType === 'audio' ? 'h-40' : 'aspect-video')} />
          ) : media.isError ? (
            <Card className="flex flex-col items-center gap-2 py-8 text-center">
              <WifiOff className="size-8 text-muted" aria-hidden />
              <ErrorState
                message={COPY.section.playbackFailed}
                onRetry={() => void media.refetch()}
              />
            </Card>
          ) : media.data.source === 'youtube' && media.data.youtubeId ? (
            <YouTubeView
              videoId={media.data.youtubeId}
              start={s.lastPositionSec}
              tracker={tracker}
              onTime={setPos}
              onDuration={setDur}
            />
          ) : media.data.url ? (
            <FileView
              url={fileUrl(media.data.url)}
              audio={s.mediaType === 'audio' || (media.data.mime ?? '').startsWith('audio/')}
              start={s.lastPositionSec}
              poster={p.product?.imageUrl ?? p.brand?.logoUrl ?? null}
              title={s.title}
              tracker={tracker}
              onTime={setPos}
              onDuration={setDur}
              onError={() => {
                track('playback_error', { source: 'file' });
                if (media.data?.expiresAt && Date.parse(media.data.expiresAt) <= Date.now()) {
                  void media.refetch();
                }
              }}
            />
          ) : (
            <ErrorState message={COPY.section.fileNotReady} />
          )}

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-text">
                {progress.completed ? COPY.section.finished : COPY.section.progress}
              </span>
              <span className="text-text-secondary">
                {clock(pos)} / {clock(dur)}
              </span>
            </div>
            <ProgressBar value={progress.percent} label={COPY.section.progressLabel} />
            <p className="text-xs text-text-secondary">
              {progress.completed ? (
                <span className="inline-flex items-center gap-1 font-bold text-success-fg">
                  <CheckCircle2 className="size-4" aria-hidden /> {COPY.section.completedNote}
                </span>
              ) : (
                LINES.completionRule(faPercent(d.completionThreshold), faPercent(progress.percent))
              )}
            </p>
          </Card>

          {quizReady ? (
            <Button
              size="lg"
              block
              variant="cta"
              icon={<ClipboardCheck className="size-5" aria-hidden />}
              onClick={() => nav(`/quiz/${s.id}`)}
              data-testid="start-quiz"
            >
              {COPY.quiz.start}
            </Button>
          ) : s.quizPassed && d.nextSectionId ? (
            <Button
              size="lg"
              block
              variant="cta"
              onClick={() => nav(`/sections/${d.nextSectionId}`)}
            >
              {COPY.quiz.nextSection}
            </Button>
          ) : s.quizPassed ? (
            <Button size="lg" block variant="secondary" onClick={() => nav(`/packages/${p.id}`)}>
              {COPY.quiz.backToPackage}
            </Button>
          ) : null}
        </div>
        <aside className="mt-4 flex flex-col gap-3 lg:mt-0 lg:w-80">
          {s.description && (
            <Card>
              <h2 className="mb-1 text-sm font-bold text-text">{COPY.section.about}</h2>
              <p className="text-sm leading-7 text-text-secondary">{s.description}</p>
            </Card>
          )}
          <Link
            to={`/packages/${p.id}`}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
          >
            <ProductImage
              src={p.product?.imageUrl ?? p.brand?.logoUrl}
              alt={p.product?.name ?? p.brand?.name ?? p.title}
              className="size-14"
            />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-text">{p.product?.name ?? p.brand?.name}</p>
              <p className="text-xs text-text-secondary">{faDuration(s.durationSec)}</p>
            </div>
          </Link>
        </aside>
      </div>
      <MentorLauncher packageId={p.id} />
    </div>
  );
}

type Tracker = ReturnType<typeof usePlaybackTracker>;

function FileView({
  url,
  audio,
  start,
  poster,
  title,
  tracker,
  onTime,
  onDuration,
  onError,
}: {
  url: string;
  audio: boolean;
  start: number;
  poster: string | null;
  title: string;
  tracker: Tracker;
  onTime: (t: number) => void;
  onDuration: (t: number) => void;
  onError: () => void;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const started = useRef(false);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);

  const handlers = {
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget;
      if (Number.isFinite(el.duration) && el.duration > 0) onDuration(el.duration);
      if (start > 0 && start < el.duration - 3) el.currentTime = start;
      tracker.seeked(el.currentTime);
    },
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget;
      tracker.sample(el.currentTime, !el.paused && !el.seeking, el.playbackRate);
      onTime(el.currentTime);
    },
    onSeeked: (e: React.SyntheticEvent<HTMLMediaElement>) =>
      tracker.seeked(e.currentTarget.currentTime),
    onPlay: () => {
      if (!started.current) {
        started.current = true;
        void tracker.flush('start');
      }
    },
    onPause: () => void tracker.flush('pause'),
    onEnded: () => void tracker.flush('ended'),
    onError: () => {
      setFailed(true);
      onError();
    },
  };
  const setSpeed = (r: number) => {
    setRate(r);
    if (ref.current) ref.current.playbackRate = r;
  };
  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <Card role="alert" className="py-6 text-center text-danger-fg" data-testid="media-error">
          {COPY.section.mediaFailed}
        </Card>
      ) : audio ? (
        <Card tone="brand" className="flex flex-col items-center gap-4 py-6">
          {poster ? (
            <ProductImage src={poster} alt={title} className="size-32 bg-surface" />
          ) : (
            <Headphones className="size-16 text-primary" aria-hidden />
          )}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- caption files are V1 (spec §11); description is shown beside the player */}
          <audio
            ref={ref}
            src={url}
            controls
            preload="metadata"
            className="w-full"
            controlsList="nodownload"
            {...handlers}
            data-testid="media"
          />
        </Card>
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- caption files are V1 (spec §11)
        <video
          ref={ref}
          src={url}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          className="aspect-video w-full rounded-card bg-black"
          {...handlers}
          data-testid="media"
        />
      )}
      <div
        className="flex items-center gap-1 self-end"
        role="group"
        aria-label={COPY.section.playbackSpeed}
      >
        {[1, 1.25, 1.5].map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={rate === r}
            onClick={() => setSpeed(r)}
            className={cn(
              'min-h-12 min-w-12 rounded-card px-2 text-sm font-bold',
              rate === r ? 'bg-primary-light text-primary' : 'text-text-secondary',
            )}
          >
            {toPersianDigits(String(r))}x
          </button>
        ))}
      </div>
    </div>
  );
}

function YouTubeView({
  videoId,
  start,
  tracker,
  onTime,
  onDuration,
}: {
  videoId: string;
  start: number;
  tracker: Tracker;
  onTime: (t: number) => void;
  onDuration: (t: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reportedYt, setReportedYt] = useState(false);
  const tr = useRef(tracker);
  tr.current = tracker;
  const cbs = useRef({ onTime, onDuration });
  cbs.current = { onTime, onDuration };

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: number | undefined;
    let disposed = false;
    let started = false;
    const el = document.createElement('div');
    host.current?.appendChild(el);
    loadYouTube()
      .then((YT) => {
        if (disposed) return;
        player = new YT.Player(el, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            start: Math.floor(start),
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            hl: 'fa',
          },
          events: {
            onReady: (e) => {
              setState('ready');
              cbs.current.onDuration(e.target.getDuration());
              tr.current.seeked(e.target.getCurrentTime());
              timer = window.setInterval(() => {
                if (!player) return;
                const playing = player.getPlayerState() === 1;
                const t = player.getCurrentTime();
                tr.current.sample(t, playing, player.getPlaybackRate());
                cbs.current.onTime(t);
              }, 1000);
            },
            onStateChange: (e) => {
              if (e.data === 1 && !started) {
                started = true;
                void tr.current.flush('start');
              }
              if (e.data === 2) void tr.current.flush('pause');
              if (e.data === 0) void tr.current.flush('ended');
            },
            onError: () => {
              setState('error');
              track('playback_error', { source: 'youtube' });
            },
          },
        });
      })
      .catch(() => setState('error'));
    return () => {
      disposed = true;
      window.clearInterval(timer);
      player?.destroy();
      el.remove();
    };
  }, [videoId, start]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:size-full">
      <div ref={host} className="absolute inset-0" />
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <Spinner className="size-8" />
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface p-4 text-center text-sm text-text">
          <WifiOff className="size-8 text-muted" aria-hidden />
          {COPY.section.youtubeBlocked}
          <button
            type="button"
            className="min-h-12 px-3 font-bold text-primary disabled:text-muted-fg"
            disabled={reportedYt}
            onClick={() => {
              setReportedYt(true);
              track('youtube_blocked_reported', { videoId });
            }}
          >
            {reportedYt ? COPY.section.reported : COPY.section.reportToAdmin}
          </button>
        </div>
      )}
    </div>
  );
}
