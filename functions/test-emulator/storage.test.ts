import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FirebaseBlobStore } from '../src/blob/firebase';
import { mp4DurationFromBuffer, sniff } from '../src/lib/media';
import { fakeMp4 } from '../test/support/ctx';

/**
 * Firebase Storage adapter against the Storage emulator (FIREBASE_STORAGE_EMULATOR_HOST is set by
 * `firebase emulators:exec`). V4 signed URLs need a real service account, so they are verified
 * after deploy (docs/USER-TODO.md); everything else the upload pipeline relies on is covered here.
 */
// This suite only runs via the emulator config — fail loudly instead of silently skipping.
if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST)
  throw new Error('FIREBASE_STORAGE_EMULATOR_HOST is not set — run via firebase emulators:exec');
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-seylane';
let app: App;
let blob: FirebaseBlobStore;

beforeAll(() => {
  app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, 'storage-test');
  blob = new FirebaseBlobStore(getStorage(app).bucket());
});
afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('storage adapter (emulator)', () => {
  it('stores a brand logo, stats it and serves a public download-token URL', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const path = 'brands/brand-sb-2/logo.png';
    await blob.put(path, png, 'image/png');
    expect(await blob.stat(path)).toEqual({ size: png.length, contentType: 'image/png' });
    expect(sniff(await blob.readRange(path, 0, 63))).toMatchObject({ mime: 'image/png' });

    const url = await blob.publicUrl(path);
    expect(url).toContain(encodeURIComponent(path));
    expect(url).toMatch(/[?&]token=[0-9a-f-]{36}$/);
    // Stable: the same token is reused on the next call (no token churn per request).
    expect(await blob.publicUrl(path)).toBe(url);
  });

  it('reads the MP4 header by byte range (server-side duration, spec §21.3 finalize)', async () => {
    const path = 'packages/pkg-x/sections/s1/video.mp4';
    await blob.put(path, fakeMp4(95), 'video/mp4');
    const head = await blob.readRange(path, 0, 4095);
    expect(sniff(head)).toMatchObject({ mime: 'video/mp4' });
    expect(mp4DurationFromBuffer(head)).toBe(95);
  });

  it('delete is idempotent and stat reports missing files', async () => {
    const path = 'packages/pkg-x/tmp.bin';
    await blob.put(path, Buffer.from('x'), 'application/octet-stream');
    await blob.delete(path);
    await blob.delete(path);
    expect(await blob.stat(path)).toBeNull();
  });
});
