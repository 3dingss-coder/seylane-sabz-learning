import { describe, expect, it } from 'vitest';
import { ffmpegArgs, planProcessing } from './plan';

const base = { mime: 'video/mp4', durationSec: 600 };

describe('planProcessing', () => {
  it('compresses big/heavy videos to mp4', () => {
    const p = planProcessing({ ...base, kind: 'video', fileName: 'x.mov', sizeBytes: 300 * 1024 * 1024 });
    expect(p).toEqual({ compress: true, outExt: 'mp4', outMime: 'video/mp4' });
  });
  it('leaves already-small mp4 untouched', () => {
    const p = planProcessing({ ...base, kind: 'video', fileName: 'x.mp4', sizeBytes: 7 * 1024 * 1024 });
    expect(p.compress).toBe(false);
    expect(p.outExt).toBe('mp4');
  });
  it('compresses an mp4 with a high bitrate', () => {
    // 41 MB over 7 minutes ≈ 800 kbps → small enough, but over the 24 MB size cap
    const p = planProcessing({ ...base, kind: 'video', fileName: 'x.mp4', sizeBytes: 41 * 1024 * 1024, durationSec: 420 });
    expect(p.compress).toBe(true);
  });
  it('compresses when duration is unknown', () => {
    const p = planProcessing({ kind: 'video', mime: 'video/mp4', fileName: 'x.mp4', sizeBytes: 1024, durationSec: null });
    expect(p.compress).toBe(true);
  });
  it('audio: keeps low-bitrate m4a, recompresses wav/large', () => {
    const low = planProcessing({ kind: 'audio', mime: 'audio/mp4', fileName: 'a.m4a', sizeBytes: 3 * 1024 * 1024, durationSec: 420 });
    expect(low.compress).toBe(false);
    const heavy = planProcessing({ kind: 'audio', mime: 'audio/mp4', fileName: 'a.m4a', sizeBytes: 11 * 1024 * 1024, durationSec: 347 });
    expect(heavy).toEqual({ compress: true, outExt: 'm4a', outMime: 'audio/mp4' });
    const wav = planProcessing({ kind: 'audio', mime: 'audio/wav', fileName: 'a.wav', sizeBytes: 3 * 1024 * 1024, durationSec: 30 });
    expect(wav.compress).toBe(true);
  });
  it('builds argv for both kinds', () => {
    expect(ffmpegArgs('video', 'in.mov', 'out.mp4')).toContain('scale=-2:min(480\\,ih)');
    expect(ffmpegArgs('audio', 'in.wav', 'out.m4a')).toContain('-vn');
  });
});
