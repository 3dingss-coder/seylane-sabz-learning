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
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface p-1.5',
        SIZES[size],
        className,
      )}
    >
      {failed ? (
        <span className="line-clamp-2 text-center text-[10px] font-bold text-text-secondary">
          {name}
        </span>
      ) : (
        <img
          src={fileUrl(logoUrl)}
          alt={`لوگوی ${name}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain"
        />
      )}
    </span>
  );
}
