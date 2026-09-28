import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/** Page title row; `back` renders an RTL back arrow (→) as a 48px target. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-1">
        {back && (
          <Link
            to={back}
            aria-label="بازگشت"
            className="-ms-3 flex size-12 shrink-0 items-center justify-center rounded-card text-text-secondary hover:bg-surface"
          >
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        )}
        <div className="min-w-0 pt-2">
          <h1 className="text-xl font-bold text-text">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-text-secondary">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
