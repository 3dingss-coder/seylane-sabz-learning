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
  /**
   * Optional capabilities used by the resumable media-library upload on stores that keep blobs
   * in a database (Cloudflare D1). They exist because one Worker request may only make a handful
   * of database calls (50 on the free plan), so per-part stat/read loops do not scale.
   * Each returns `null` when the store cannot do it; callers then fall back to the generic path.
   */
  /** Complete blobs whose path starts with `prefix` — a single query. */
  listStored?(prefix: string): Promise<Array<{ path: string; size: number }> | null>;
  /**
   * Build `dest` by concatenating `parts` INSIDE the database (no bytes pass through the Worker).
   * Every part except the last must be a multiple of the store's chunk size.
   */
  composeParts?(
    parts: Array<{ path: string; size: number }>,
    dest: string,
    contentType: string,
  ): Promise<boolean | null>;
  /** Delete every blob whose path starts with `prefix` — a single batch. */
  deletePrefix?(prefix: string): Promise<boolean | null>;
}
