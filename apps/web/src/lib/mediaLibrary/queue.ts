import { useSyncExternalStore } from 'react';
import { ApiError, api, uploadToSignedUrl } from '../api';
import { kindOf, mimeOf, probeDuration } from '../upload';
import { EtaEstimator } from './eta';
import { LIBRARY_MAX_BYTES, planProcessing, type LibraryKind } from './plan';
import { uploadResumable, type UploadDeps } from './resumable';
import { TranscodeFailed, TranscodeUnavailable, cancelTranscode, transcode } from './transcode';
import type { LibraryItem } from './types';

export type JobStage =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'canceled';

export interface Job {
  id: string;
  fileName: string;
  kind: LibraryKind | null;
  sizeBytes: number;
  stage: JobStage;
  /** Overall 0..1 across preparing + uploading. */
  progress: number;
  etaMs: number | null;
  error: string | null;
  /** Shown when the file was stored without being optimised. */
  note: string | null;
  /** Technical reason behind `note`/`error` (compression failure text) for support. */
  detail: string | null;
  item: LibraryItem | null;
}

export interface NewJob {
  file: File;
  title?: string;
  brandId?: string | null;
  productId?: string | null;
}

/** Everything outside the queue's own logic — injected so the whole pipeline is unit-testable. */
export interface QueueDeps {
  upload: UploadDeps;
  probe(file: File, kind: LibraryKind): Promise<number | null>;
  transcode: typeof transcode;
  cancelTranscode(): void;
  onItemReady(item: LibraryItem): void;
}

export const defaultDeps = (onItemReady: (item: LibraryItem) => void): QueueDeps => ({
  upload: {
    post: (path, body) => api.post(path, body),
    del: (path) => api.del(path),
    putPart: (ticket, blob, onProgress) =>
      uploadToSignedUrl(ticket, blob, (pct) => onProgress((pct / 100) * blob.size)),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  },
  probe: (file, kind) => probeDuration(file, kind),
  transcode,
  cancelTranscode,
  onItemReady,
});

// Compression usually dominates wall-clock time, so it gets most of the progress bar.
const PREPARE_WEIGHT = 0.65;

interface Internal {
  job: Job;
  input: NewJob;
  abort: AbortController;
  eta: EtaEstimator;
}

let seq = 0;

export class MediaUploadQueue {
  private jobs: Internal[] = [];
  private listeners = new Set<() => void>();
  private snapshot: Job[] = [];
  private running = false;

  constructor(private readonly deps: QueueDeps) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = this.jobs.map((j) => ({ ...j.job }));
    for (const l of this.listeners) l();
  }

  hasActive(): boolean {
    return this.jobs.some((j) => ['queued', 'preparing', 'uploading', 'finalizing'].includes(j.job.stage));
  }

  add(inputs: NewJob[]): void {
    for (const input of inputs) {
      const kind = kindOf(input.file);
      this.jobs.push({
        input,
        abort: new AbortController(),
        eta: new EtaEstimator(),
        job: {
          id: `job-${Date.now()}-${++seq}`,
          fileName: input.file.name,
          kind: kind === 'video' || kind === 'audio' ? kind : null,
          sizeBytes: input.file.size,
          stage: 'queued',
          progress: 0,
          etaMs: null,
          error: null,
          note: null,
          detail: null,
          item: null,
        },
      });
    }
    this.emit();
    void this.pump();
  }

  cancel(id: string): void {
    const j = this.jobs.find((x) => x.job.id === id);
    if (!j) return;
    if (j.job.stage === 'queued') this.patch(j, { stage: 'canceled' });
    else if (['preparing', 'uploading', 'finalizing'].includes(j.job.stage)) {
      j.abort.abort();
      if (j.job.stage === 'preparing') this.deps.cancelTranscode();
    }
  }

  retry(id: string): void {
    const j = this.jobs.find((x) => x.job.id === id);
    if (!j || !['error', 'canceled'].includes(j.job.stage)) return;
    j.abort = new AbortController();
    j.eta = new EtaEstimator();
    this.patch(j, { stage: 'queued', progress: 0, etaMs: null, error: null, note: null, detail: null });
    void this.pump();
  }

  dismiss(id: string): void {
    const j = this.jobs.find((x) => x.job.id === id);
    if (!j || ['preparing', 'uploading', 'finalizing'].includes(j.job.stage)) return;
    this.jobs = this.jobs.filter((x) => x !== j);
    this.emit();
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => !['done', 'canceled'].includes(j.job.stage));
    this.emit();
  }

  private patch(j: Internal, p: Partial<Job>) {
    j.job = { ...j.job, ...p };
    this.emit();
  }

  private setProgress(j: Internal, overall: number) {
    j.eta.update(overall);
    this.patch(j, { progress: Math.min(1, Math.max(j.job.progress, overall)), etaMs: j.eta.remainingMs() });
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const next = this.jobs.find((j) => j.job.stage === 'queued');
        if (!next) break;
        await this.run(next);
      }
    } finally {
      this.running = false;
    }
  }

  private async run(j: Internal) {
    const { file } = j.input;
    const kind = j.job.kind;
    const fail = (error: string) => this.patch(j, { stage: 'error', error, etaMs: null });
    if (!kind) return fail('فقط فایل ویدئویی یا صوتی پشتیبانی می‌شود.');
    if (file.size === 0) return fail('فایل خالی است.');

    this.patch(j, { stage: 'preparing', progress: 0, etaMs: null });
    try {
      const duration = await this.deps.probe(file, kind);
      const plan = planProcessing({
        kind,
        fileName: file.name,
        mime: mimeOf(file),
        sizeBytes: file.size,
        durationSec: duration,
      });

      let blob: Blob = file;
      let outName = file.name;
      let mime = mimeOf(file);
      let weight = 0; // share of the bar already spent before the upload starts
      if (plan.compress) {
        weight = PREPARE_WEIGHT;
        try {
          blob = await this.deps.transcode(file, kind, plan.outExt, plan.outMime, {
            signal: j.abort.signal,
            onProgress: (f) => this.setProgress(j, f * PREPARE_WEIGHT),
          });
          outName = `${file.name.replace(/\.[^.]+$/, '')}.${plan.outExt}`;
          mime = plan.outMime;
          // A "compressed" result that is bigger than the source is useless — keep the source.
          if (blob.size >= file.size && file.size <= LIBRARY_MAX_BYTES) {
            blob = file;
            outName = file.name;
            mime = mimeOf(file);
          }
        } catch (e) {
          if (j.abort.signal.aborted) throw e;
          if (!(e instanceof TranscodeUnavailable || e instanceof TranscodeFailed)) throw e;
          console.error('[media-library] in-browser compression failed:', e);
          this.patch(j, { detail: e.message || e.constructor.name });
          if (file.size > LIBRARY_MAX_BYTES)
            return fail(
              'این فایل برای بارگذاری بزرگ است و بهینه‌سازی آن روی این مرورگر ممکن نشد. از Chrome یا Edge نسخه‌ی جدید روی رایانه استفاده کنید.',
            );
          this.patch(j, { note: 'فایل بدون بهینه‌سازی ذخیره شد؛ حجم آن از حالت معمول بیشتر است.' });
          this.setProgress(j, PREPARE_WEIGHT);
        }
      }

      this.patch(j, { stage: 'uploading' });
      const item = await uploadResumable(
        {
          blob,
          kind,
          fileName: outName,
          mime,
          title: j.input.title,
          brandId: j.input.brandId,
          productId: j.input.productId,
          durationSec: duration,
        },
        this.deps.upload,
        {
          signal: j.abort.signal,
          onProgress: (f) => {
            this.setProgress(j, weight + f * (1 - weight));
            if (f >= 1 && j.job.stage === 'uploading') this.patch(j, { stage: 'finalizing' });
          },
        },
      );
      this.patch(j, { stage: 'done', progress: 1, etaMs: 0, item });
      this.deps.onItemReady(item);
    } catch (e) {
      if (j.abort.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        this.patch(j, { stage: 'canceled', etaMs: null });
      } else {
        fail(e instanceof ApiError ? e.message : 'بارگذاری ناموفق بود. دوباره تلاش کنید.');
      }
    }
  }
}

let shared: MediaUploadQueue | null = null;
let onReady: (item: LibraryItem) => void = () => {};

/** One queue per tab: uploads keep running while the admin navigates between panel pages. */
export function getUploadQueue(): MediaUploadQueue {
  shared ??= new MediaUploadQueue(defaultDeps((item) => onReady(item)));
  return shared;
}
export function setOnItemReady(fn: (item: LibraryItem) => void) {
  onReady = fn;
}

export function useUploadJobs(): Job[] {
  const q = getUploadQueue();
  return useSyncExternalStore(q.subscribe, q.getSnapshot, q.getSnapshot);
}

