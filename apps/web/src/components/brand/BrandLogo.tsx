// Adapted from helper kit: «اپ مشتری/کامپوننت‌ها/BrandsGrid.tsx» (logo tile) —
// material-symbols removed, tokens applied. Always renders the REAL brand logo URL
// (Firebase Storage in prod, /catalog mirror locally). If the image fails, falls back to the
// brand name as text — never a fake/placeholder image.
import { useState } from 'react';
import { fileUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface BrandLogoProps {
  name: string;
  logoUrl: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'size-10', md: 'size-14', lg: 'size-20' } as const;

export function BrandLogo({ name, logoUrl, size = 'md', className }: BrandLogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolved = fileUrl(logoUrl);
  const failed = Boolean(resolved && failedSrc === resolved);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-white p-1.5',
        SIZES[size],
        className,
      )}
    >
      {failed || !resolved ? (
        <span className="line-clamp-2 text-center text-[10px] font-bold text-text-secondary">
          {name}
        </span>
      ) : (
        <img
          src={resolved}
          alt={`لوگوی ${name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(resolved)}
          className="max-h-full max-w-full object-contain"
        />
      )}
    </span>
  );
}
