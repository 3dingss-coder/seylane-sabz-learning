import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BlobStore, UploadTicket } from './types';

export interface LocalTicket {
  p: string; // object path
  ct: string; // content type
  max: number; // max bytes
  exp: number; // epoch ms
  op: 'put' | 'get';
}

/**
 * Filesystem blob store. URLs are relative (`/v1/...`) so they work behind the Vite proxy and
 * the preview host; the client resolves them against its API base.
 */
export class LocalBlobStore implements BlobStore {
  constructor(
    readonly root: string,
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    fs.mkdirSync(root, { recursive: true });
  }

  resolve(p: string): string {
    const full = path.resolve(this.root, p);
    if (!full.startsWith(path.resolve(this.root) + path.sep))
      throw new Error('Path escapes blob root');
    return full;
  }

  signTicket(t: LocalTicket): string {
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
      if (t.op !== op || t.exp < this.now()) return null;
      return t;
    } catch {
      return null;
    }
  }

  async put(p: string, data: Uint8Array, contentType: string) {
    const full = this.resolve(p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
    fs.writeFileSync(`${full}.meta.json`, JSON.stringify({ contentType }));
  }

  /** Links an existing file (seed from repository media without copying). */
  linkFrom(p: string, source: string, contentType: string) {
    const full = this.resolve(p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (fs.existsSync(full)) fs.rmSync(full);
    try {
      fs.linkSync(source, full);
    } catch {
      fs.copyFileSync(source, full);
    }
    fs.writeFileSync(`${full}.meta.json`, JSON.stringify({ contentType }));
  }

  async createUploadUrl(p: string, contentType: string, maxBytes: number): Promise<UploadTicket> {
    const exp = this.now() + 15 * 60_000;
    const token = this.signTicket({ p, ct: contentType, max: maxBytes, exp, op: 'put' });
    return {
      url: `/v1/uploads/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(exp).toISOString(),
    };
  }

  async stat(p: string) {
    const full = this.resolve(p);
    if (!fs.existsSync(full)) return null;
    const meta = fs.existsSync(`${full}.meta.json`)
      ? (JSON.parse(fs.readFileSync(`${full}.meta.json`, 'utf8')) as { contentType: string })
      : { contentType: 'application/octet-stream' };
    return { size: fs.statSync(full).size, contentType: meta.contentType };
  }

  async readRange(p: string, start: number, end: number) {
    const full = this.resolve(p);
    const fd = fs.openSync(full, 'r');
    try {
      const len = Math.max(0, end - start + 1);
      const buf = Buffer.alloc(len);
      const n = fs.readSync(fd, buf, 0, len, start);
      return buf.subarray(0, n);
    } finally {
      fs.closeSync(fd);
    }
  }

  async signedReadUrl(p: string, ttlSec: number) {
    const token = this.signTicket({
      p,
      ct: '',
      max: 0,
      exp: this.now() + ttlSec * 1000,
      op: 'get',
    });
    return `/v1/files/signed/${token}`;
  }

  async publicUrl(p: string) {
    return `/v1/files/public/${p.split('/').map(encodeURIComponent).join('/')}`;
  }

  async delete(p: string) {
    const full = this.resolve(p);
    fs.rmSync(full, { force: true });
    fs.rmSync(`${full}.meta.json`, { force: true });
  }
}
