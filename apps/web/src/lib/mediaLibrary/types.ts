import type { LibraryKind } from './plan';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  originalName: string;
  mime: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  createdAt: string;
  brandId: string | null;
  productId: string | null;
  brandName: string | null;
  productName: string | null;
  /** true when brand/product come from the package that uses the file, not from the library. */
  assignmentInferred: boolean;
  usedBy: Array<{ packageId: string; packageTitle: string; sectionId: string; sectionTitle: string }>;
}

export interface UploadTicket {
  url: string;
  method: string;
  headers: Record<string, string>;
}
