import type { LibraryItem } from './types';

/** Request body that turns a library file into a section — one shape for every entry point. */
export function sectionBodyFromItem(item: LibraryItem, title?: string, extra: object = {}) {
  return {
    title: (title ?? item.title).trim(),
    description: '',
    transcript: '',
    mediaType: item.kind,
    mediaSource: 'file' as const,
    youtubeUrl: null,
    mediaId: item.id,
    ...(item.durationSec ? { durationSec: item.durationSec } : {}),
    ...extra,
  };
}
