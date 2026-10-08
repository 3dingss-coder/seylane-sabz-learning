import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Router, type Request } from 'express';
import { LocalBlobStore } from '../blob/local';
import { ApiError } from '../http/errors';
import { createPlaceholderMp4 } from '../seed/seed';

/**
 * Local-mode blob endpoints (Firebase mode uses Storage signed URLs instead):
 *   PUT  /uploads/:token          — signed upload (streamed, size-capped)
 *   GET  /files/signed/:token     — signed private read (Range supported)
 *   GET  /files/public/brands/... — public catalog images only (brands/, products/, branding/)
 */
export function localFilesRouter(blob: LocalBlobStore): Router {
  const r = Router();
  r.put('/uploads/:token', async (req: Request, res, next) => {
    try {
      const t = blob.verifyTicket(String(req.params.token), 'put');
      if (!t) throw new ApiError('FORBIDDEN', 'لینک آپلود منقضی یا نامعتبر است.');
      const len = Number(req.headers['content-length'] ?? 0);
      if (len > t.max) throw new ApiError('VALIDATION', 'حجم فایل بیش از حد مجاز است.');
      const full = blob.resolve(t.p);
      fs.mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
      let received = 0;
      req.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > t.max) req.destroy(new Error('too large'));
      });
      await pipeline(req, fs.createWriteStream(full));
      fs.writeFileSync(`${full}.meta.json`, JSON.stringify({ contentType: t.ct }));
      res.status(200).json({ data: { ok: true, size: received } });
    } catch (e) {
      next(
        e instanceof ApiError
          ? e
          : new ApiError('VALIDATION', 'آپلود ناموفق بود. دوباره تلاش کنید.'),
      );
    }
  });

  const send = (res: import('express').Response, p: string) => {
    const full = blob.resolve(p);
    if (!fs.existsSync(full)) {
      // Serverless / snapshot cold start: generate seeded placeholder media on demand.
      if (p.startsWith('media/audio/seed-media-') || p.startsWith('media/video/seed-media-')) {
        const isAudio = p.startsWith('media/audio/');
        const buf = createPlaceholderMp4(isAudio, isAudio ? 420 : 540);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Content-Type', isAudio ? 'audio/mp4' : 'video/mp4');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.status(200).send(Buffer.from(buf));
        return;
      }
      if (p === 'branding/holding-logo.png') {
        res.redirect(302, '/icons/logo-full.png');
        return;
      }
      if (p.startsWith('brands/') || p.startsWith('products/')) {
        res.redirect(302, `/catalog/${p}`);
        return;
      }
      throw new ApiError('NOT_FOUND');
    }
    const meta = fs.existsSync(`${full}.meta.json`)
      ? (JSON.parse(fs.readFileSync(`${full}.meta.json`, 'utf8')) as { contentType?: string })
      : {};
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Path is relative to the blob root (resolve() already rejects traversal); dotfiles are
    // checked only below the root, so a root like `.local-data/` still works.
    res.sendFile(path.relative(blob.root, full), {
      root: blob.root,
      headers: {
        'Content-Type': meta.contentType ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
      dotfiles: 'deny',
    });
  };

  r.get('/files/signed/:token', (req, res, next) => {
    try {
      const t = blob.verifyTicket(String(req.params.token), 'get');
      if (!t) throw new ApiError('FORBIDDEN', 'لینک فایل منقضی شده است. صفحه را دوباره باز کنید.');
      send(res, t.p);
    } catch (e) {
      next(e);
    }
  });

  r.get(/^\/files\/public\/((?:brands|products|branding)\/.+)$/, (req, res, next) => {
    try {
      const p = decodeURIComponent((req.params as Record<string, string>)[0] ?? '');
      if (p.includes('..') || p.endsWith('.meta.json')) throw new ApiError('NOT_FOUND');
      send(res, p);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
