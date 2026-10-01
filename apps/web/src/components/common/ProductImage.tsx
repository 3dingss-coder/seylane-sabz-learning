import { useState } from 'react';
import { fileUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Real product image / brand logo from Storage (never a placeholder); falls back to text. */
export function ProductImage({
  src,
  alt,
  className,
  contain = true,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  contain?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const url = fileUrl(src);
  const failed = Boolean(url && failedSrc === url);
  const loaded = Boolean(url && loadedSrc === url);
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-white shadow-xs',
        className,
      )}
    >
      {failed || !url ? (
        <span className="line-clamp-3 p-1 text-center text-[10px] font-bold text-text-secondary">
          {alt}
        </span>
      ) : (
        <>
          {!loaded && <span aria-hidden className="absolute inset-0 bg-surface-2" />}
          <img
            src={url}
            alt={alt}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoadedSrc(url)}
            onError={() => setFailedSrc(url)}
            className={cn(
              'relative size-full',
              loaded ? 'opacity-100' : 'opacity-0',
              contain ? 'object-contain p-1.5' : 'object-cover',
            )}
          />
        </>
      )}
    </span>
  );
}
