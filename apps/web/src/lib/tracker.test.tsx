import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from './session';
import { usePlaybackTracker } from './tracker';
import { mockApi } from '@/test/mockApi';

afterEach(() => vi.unstubAllGlobals());

describe('usePlaybackTracker (anti-cheat, 28.2 #3)', () => {
  it('counts only continuous playback; seeks and paused time add nothing', async () => {
    session.setAccess('t', 3600);
    const { calls } = mockApi({
      'POST /v1/me/sections/s1/progress': () => ({
        data: { percent: 5, completed: false, lastPositionSec: 0 },
      }),
    });
    const { result } = renderHook(() => usePlaybackTracker('s1', () => {}));
    act(() => {
      result.current.seeked(0);
      for (let t = 0.25; t <= 4; t += 0.25) result.current.sample(t, true); // 4s played
      result.current.sample(300, true); // jump forward (seek without event) → ignored
      result.current.sample(300.25, false); // paused → ignored
      result.current.seeked(100);
      result.current.sample(101, true); // +1s
    });
    await act(async () => {
      await result.current.flush('pause');
    });
    const beat = calls.find((c) => c.key === 'POST /v1/me/sections/s1/progress');
    expect(beat?.body).toMatchObject({ playedDeltaSec: 5, positionSec: 101, event: 'pause' });
    expect(beat?.headers['Idempotency-Key']).toBeTruthy();
  });

  it('queues beats offline with their idempotency key', async () => {
    session.setAccess('t', 3600);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    localStorage.removeItem('ssl.beats');
    const { result } = renderHook(() => usePlaybackTracker('s1', () => {}));
    act(() => {
      result.current.seeked(0);
      for (let t = 0.5; t <= 3; t += 0.5) result.current.sample(t, true);
    });
    await act(async () => {
      await result.current.flush('pause');
    });
    const q = JSON.parse(localStorage.getItem('ssl.beats') ?? '[]') as Array<{
      key: string;
      body: { playedDeltaSec: number };
    }>;
    expect(q).toHaveLength(1);
    expect(q[0]?.body.playedDeltaSec).toBe(3);
    expect(q[0]?.key).toBeTruthy();
  });
});
