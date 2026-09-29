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
  const url = fileUrl(src);
  const failed = Boolean(url && failedSrc === url);
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface',
        className,
      )}
    >
      {failed || !url ? (
        <span className="line-clamp-3 p-1 text-center text-[10px] font-bold text-text-secondary">
          {alt}
        </span>
      ) : (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(url)}
          className={cn('size-full', contain ? 'object-contain p-1' : 'object-cover')}
        />
      )}
    </span>
  );
}
