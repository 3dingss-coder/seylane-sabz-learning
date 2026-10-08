import { randomUUID } from 'node:crypto';
import type { Bucket } from '@google-cloud/storage';
import type { BlobStore, UploadTicket } from './types';

/**
 * Firebase Storage adapter. Upload/read URLs are V4 signed URLs (the Functions service account
 * needs the "Service Account Token Creator" role — see docs/USER-TODO.md). Public catalog images
 * use Firebase download tokens so <img> works without auth headers.
 */
export class FirebaseBlobStore implements BlobStore {
  constructor(private readonly bucket: Bucket) {}

  async put(path: string, data: Uint8Array, contentType: string) {
    await this.bucket.file(path).save(Buffer.from(data), { contentType, resumable: false });
  }
  async createUploadUrl(
    path: string,
    contentType: string,
    _maxBytes: number,
  ): Promise<UploadTicket> {
    const expires = Date.now() + 15 * 60_000;
    const [url] = await this.bucket
      .file(path)
      .getSignedUrl({ version: 'v4', action: 'write', expires, contentType });
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(expires).toISOString(),
    };
  }
  async stat(path: string) {
    const f = this.bucket.file(path);
    const [exists] = await f.exists();
    if (!exists) return null;
    const [meta] = await f.getMetadata();
    return {
      size: Number(meta.size ?? 0),
      contentType: String(meta.contentType ?? 'application/octet-stream'),
    };
  }
  async readRange(path: string, start: number, end: number) {
    const [buf] = await this.bucket.file(path).download({ start, end });
    return buf;
  }
  async signedReadUrl(path: string, ttlSec: number) {
    const [url] = await this.bucket
      .file(path)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlSec * 1000 });
    return url;
  }
  async publicUrl(path: string) {
    const f = this.bucket.file(path);
    const [meta] = await f.getMetadata();
    let token = (meta.metadata?.firebaseStorageDownloadTokens as string | undefined)?.split(',')[0];
    if (!token) {
      token = randomUUID();
      await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    return `https://firebasestorage.googleapis.com/v0/b/${this.bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
  async delete(path: string) {
    await this.bucket.file(path).delete({ ignoreNotFound: true });
  }
}
