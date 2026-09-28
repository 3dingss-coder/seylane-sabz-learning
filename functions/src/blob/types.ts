export interface UploadTicket {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/** Object storage port: local filesystem (dev/test) or Firebase Storage. */
export interface BlobStore {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  createUploadUrl(path: string, contentType: string, maxBytes: number): Promise<UploadTicket>;
  stat(path: string): Promise<{ size: number; contentType: string } | null>;
  /** Inclusive byte range [start, end]. */
  readRange(path: string, start: number, end: number): Promise<Buffer>;
  signedReadUrl(path: string, ttlSec: number): Promise<string>;
  /** Stable URL for public catalog images (brand logos / product images). */
  publicUrl(path: string): Promise<string>;
  delete(path: string): Promise<void>;
}
