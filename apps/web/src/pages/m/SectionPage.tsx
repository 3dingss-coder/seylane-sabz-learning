import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Headphones, WifiOff } from 'lucide-react';
import { Button, Card, ErrorState, ProgressBar, Skeleton, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductImage } from '@/components/common/ProductImage';
import { QueryState } from '@/components/common/QueryState';
import { MentorLauncher } from '@/components/learning/MentorSheet';
import { RememberPage } from '@/lib/pageContext';
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
  const [mediaRetryKey, setMediaRetryKey] = useState(0);
  const media = useQuery({
    queryKey: ['me', 'media', s.id],
    queryFn: ({ signal }) => api.get<SectionMedia>(`/me/sections/${s.id}/media`, signal),
    // Signed URLs expire after four hours; do not reuse a cached URL on a later visit.
    staleTime: 0,
    refetchOnMount: 'always',
    // A background refetch hands out a new signed URL; swapping it under a playing element
    // causes the black screen / restart. Fresh URLs are fetched on mount and via the retry button.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const onResult = (r: ProgressResult) => {
    setProgress((prev) => {
      if (!prev.completed && r.completed) {
        void qc.invalidateQueries({
          queryKey: ['me'],
          predicate: (q) => q.queryKey[1] !== 'media',
        });
      }
      return {
        percent: Math.max(prev.percent, r.percent),
        completed: prev.completed || r.completed,
      };
    });
  };
  const tracker = usePlaybackTracker(s.id, onResult);
  const retryMedia = () => {
    void media.refetch().finally(() => setMediaRetryKey((key) => key + 1));
  };
  const playbackPercent =
    Number.isFinite(dur) && dur > 0 ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0;

  const quizSectionId = d.quizSectionId ?? s.id;
  const quizReady = !(d.packageQuizPassed ?? s.quizPassed);
  const sectionDone = !quizReady;
  return (
    <div className="flex flex-col gap-4">
      <RememberPage
        kind="section"
        brandId={p.brand?.id ?? null}
        brandName={p.brand?.name ?? null}
        productId={p.product?.id ?? null}
        productName={p.product?.name ?? null}
        packageId={p.id}
        packageTitle={p.title}
        sectionId={s.id}
        sectionTitle={s.title}
        progressPercent={progress.percent}
        activityLine={`قسمت «${s.title}» را باز کرد`}
      />
      <PageHeader
        title={s.title}
        back={`/packages/${p.id}`}
        subtitle={
          <span>
            {p.title} • قسمت {toPersianDigits(d.position.index)} از{' '}
            {toPersianDigits(d.position.total)}
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
                message="پخش ممکن نشد. اتصال را بررسی کنید."
                onRetry={() => void media.refetch()}
              />
            </Card>
          ) : media.data.source === 'youtube' && media.data.youtubeId ? (
            <YouTubeView
              key={`${media.data.youtubeId}:${mediaRetryKey}`}
              videoId={media.data.youtubeId}
              start={pos}
              onRetry={retryMedia}
              tracker={tracker}
              onTime={setPos}
              onDuration={setDur}
            />
          ) : media.data.url ? (
            <FileView
              key={`${s.id}:${mediaRetryKey}`}
              url={fileUrl(media.data.url)}
              audio={s.mediaType === 'audio' || (media.data.mime ?? '').startsWith('audio/')}
              start={pos}
              poster={p.product?.imageUrl ?? p.brand?.logoUrl ?? null}
              title={s.title}
              tracker={tracker}
              onTime={setPos}
              onDuration={setDur}
              onError={() => track('playback_error', { source: 'file' })}
              onRetry={retryMedia}
            />
          ) : (
            <ErrorState message="فایل این قسمت هنوز آماده نیست." />
          )}

          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-text">
                {progress.completed ? 'دیدن/شنیدن کامل شد' : 'پیشرفت این قسمت'}
              </span>
              <span className="text-text-secondary">
                {clock(pos)} / {clock(dur)}
              </span>
            </div>
            <ProgressBar value={playbackPercent} label="پیشرفت پخش" />
            <p className="text-xs text-text-secondary">
              {progress.completed ? (
                <span className="inline-flex items-center gap-1 font-bold text-success-fg">
                  <CheckCircle2 className="size-4" aria-hidden /> این قسمت را کامل کردی.
                </span>
              ) : (
                `${quizReady ? 'آزمون بسته از همان اول باز است؛ دیدن یا شنیدن اجباری نیست. ' : ''}برای کامل شدن قسمت، حداقل ${faPercent(d.completionThreshold)} را ببین یا بشنو. (${faPercent(progress.percent)})`
              )}
            </p>
          </Card>

          {quizReady ? (
            <Button
              size="lg"
              block
              icon={<ClipboardCheck className="size-5" aria-hidden />}
              onClick={() => nav(`/quiz/${quizSectionId}`)}
              data-testid="start-quiz"
            >
              شروع آزمون
            </Button>
          ) : sectionDone ? (
            <Button size="lg" block variant="secondary" onClick={() => nav(`/packages/${p.id}`)}>
              بازگشت به بسته
            </Button>
          ) : null}
        </div>
        <aside className="mt-4 flex flex-col gap-3 lg:mt-0 lg:w-80">
          {s.description && (
            <Card>
              <h2 className="mb-1 text-sm font-bold text-text">درباره این قسمت</h2>
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
  onRetry,
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
  onRetry: () => void;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  // The src is frozen for this mount; a retry remounts (new key) and picks up the fresh URL.
  const src = useRef(url).current;
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
        <Card
          role="alert"
          className="flex flex-col items-center gap-3 py-6 text-center text-danger-fg"
          data-testid="media-error"
        >
          <p>
            فایل صوتی یا ویدیویی بارگذاری نشد؛ ممکن است لینک پخش منقضی شده یا اتصال قطع شده باشد.
          </p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            تلاش دوباره برای پخش
          </Button>
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
            src={src}
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
          src={src}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          className="aspect-video w-full rounded-card bg-black"
          {...handlers}
          data-testid="media"
        />
      )}
      <div className="flex items-center gap-1 self-end" role="group" aria-label="سرعت پخش">
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
  onRetry,
}: {
  videoId: string;
  start: number;
  tracker: Tracker;
  onRetry: () => void;
  onTime: (t: number) => void;
  onDuration: (t: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Resume position is only an initial value. Progress refetches must never recreate the player.
  const initialStart = useRef(start);
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
            start: Math.floor(initialStart.current),
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            hl: 'fa',
          },
          events: {
            onReady: (e) => {
              setState('ready');
              const d0 = e.target.getDuration();
              if (d0 > 0) cbs.current.onDuration(d0);
              tr.current.seeked(e.target.getCurrentTime());
              timer = window.setInterval(() => {
                if (!player) return;
                const playing = player.getPlayerState() === 1;
                const t = player.getCurrentTime();
                tr.current.sample(t, playing, player.getPlaybackRate());
                cbs.current.onTime(t);
                // getDuration() can be 0 until metadata loads; keep syncing until it is known.
                const d = player.getDuration();
                if (d > 0) cbs.current.onDuration(d);
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
  }, [videoId]);

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
          ویدیو بارگذاری نشد. اگر یوتیوب در دسترس نیست، اتصال خود را بررسی کنید.
          <Button type="button" variant="secondary" onClick={onRetry}>
            تلاش دوباره برای پخش
          </Button>
          <button
            type="button"
            className="min-h-12 px-3 font-bold text-primary disabled:text-muted-fg"
            disabled={reportedYt}
            onClick={() => {
              setReportedYt(true);
              track('youtube_blocked_reported', { videoId });
            }}
          >
            {reportedYt ? 'گزارش شد؛ ممنون' : 'گزارش مشکل به ادمین'}
          </button>
        </div>
      )}
    </div>
  );
}
