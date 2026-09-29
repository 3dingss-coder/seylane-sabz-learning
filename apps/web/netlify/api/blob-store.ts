import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import express, { Router, type Response } from 'express';
import type { BlobStore, UploadTicket } from '../../../../functions/src/blob/types';
import type { LocalTicket } from '../../../../functions/src/blob/local';
import { ApiError } from '../../../../functions/src/http/errors';

type Meta = { contentType: string; size: number };

/**
 * Object storage on Netlify Blobs. URLs are API-relative (`/v1/...`) and served by
 * `netlifyFilesRouter`, mirroring the local-mode signed ticket scheme (LocalBlobStore).
 */
export class NetlifyBlobStore implements BlobStore {
  constructor(private readonly secret: string) {}

  private get store() {
    return getStore({ name: 'media', consistency: 'strong' });
  }

  private signTicket(t: LocalTicket): string {
    const body = Buffer.from(JSON.stringify(t)).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  verifyTicket(token: string, op: LocalTicket['op']): LocalTicket | null {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalTicket;
      if (t.op !== op || t.exp < Date.now()) return null;
      return t;
    } catch {
      return null;
    }
  }

  async put(p: string, data: Buffer, contentType: string) {
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    await this.store.set(p, bytes as ArrayBuffer, {
      metadata: { contentType, size: data.length } satisfies Meta,
    });
  }

  async createUploadUrl(p: string, contentType: string, maxBytes: number): Promise<UploadTicket> {
    const exp = Date.now() + 15 * 60_000;
    const token = this.signTicket({ p, ct: contentType, max: maxBytes, exp, op: 'put' });
    return {
      url: `/v1/uploads/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(exp).toISOString(),
    };
  }

  async stat(p: string) {
    const res = await this.store.getMetadata(p);
    if (!res) return null;
    const meta = res.metadata as Partial<Meta>;
    return {
      size: Number(meta.size ?? 0),
      contentType: meta.contentType ?? 'application/octet-stream',
    };
  }

  async read(p: string): Promise<{ data: Buffer; meta: Meta } | null> {
    const res = await this.store.getWithMetadata(p, { type: 'arrayBuffer' });
    if (!res) return null;
    const data = Buffer.from(res.data);
    const meta = res.metadata as Partial<Meta>;
    return {
      data,
      meta: { contentType: meta.contentType ?? 'application/octet-stream', size: data.length },
    };
  }

  async readRange(p: string, start: number, end: number) {
    const file = await this.read(p);
    if (!file) throw new Error(`Blob not found: ${p}`);
    return file.data.subarray(start, end + 1);
  }

  async signedReadUrl(p: string, ttlSec: number) {
    const token = this.signTicket({ p, ct: '', max: 0, exp: Date.now() + ttlSec * 1000, op: 'get' });
    return `/v1/files/signed/${token}`;
  }

  async publicUrl(p: string) {
    return `/v1/files/public/${p.split('/').map(encodeURIComponent).join('/')}`;
  }

  async delete(p: string) {
    await this.store.delete(p);
  }
}

/** Blob endpoints for NetlifyBlobStore (same routes as localFilesRouter). */
export function netlifyFilesRouter(blob: NetlifyBlobStore): Router {
  const r = Router();
  r.put('/uploads/:token', express.raw({ type: () => true, limit: '6mb' }), async (req, res, next) => {
    try {
      const t = blob.verifyTicket(String(req.params.token), 'put');
      if (!t) throw new ApiError('FORBIDDEN', 'لینک آپلود منقضی یا نامعتبر است.');
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length > t.max) throw new ApiError('VALIDATION', 'حجم فایل بیش از حد مجاز است.');
      await blob.put(t.p, body, t.ct);
      res.status(200).json({ data: { ok: true, size: body.length } });
    } catch (e) {
      next(
        e instanceof ApiError
          ? e
          : new ApiError('VALIDATION', 'آپلود ناموفق بود. دوباره تلاش کنید.'),
      );
    }
  });

  const send = async (res: Response, range: string | undefined, p: string) => {
    const file = await blob.read(p);
    if (!file) throw new ApiError('NOT_FOUND');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', file.meta.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    const size = file.data.length;
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && size > 0) {
      let start = m[1] ? Number(m[1]) : size - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(size - 1, end);
      if (start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.end(file.data.subarray(start, end + 1));
      return;
    }
    res.status(200).end(file.data);
  };

  r.get('/files/signed/:token', async (req, res, next) => {
    try {
      const t = blob.verifyTicket(String(req.params.token), 'get');
      if (!t) throw new ApiError('FORBIDDEN', 'لینک فایل منقضی شده است. صفحه را دوباره باز کنید.');
      await send(res, req.headers.range, t.p);
    } catch (e) {
      next(e);
    }
  });

  r.get(/^\/files\/public\/((?:brands|products|branding)\/.+)$/, async (req, res, next) => {
    try {
      const p = decodeURIComponent((req.params as Record<string, string>)[0] ?? '');
      if (p.includes('..')) throw new ApiError('NOT_FOUND');
      await send(res, req.headers.range, p);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
