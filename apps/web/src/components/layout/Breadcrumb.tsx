import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { SidebarItem } from '@/components/layout/Sidebar';
import { isItemActive } from '@/lib/navMatch';

/** Panel breadcrumb: «پنل › بخش › جزئیات». Only rendered on pages deeper than a nav root. */
export function Breadcrumb({ title, items }: { title: string; items: SidebarItem[] }) {
  const { pathname } = useLocation();
  const current = items.find((it) => isItemActive(pathname, it));
  if (!current) return null;
  const isDetail = pathname !== current.to;
  if (!isDetail) return null;
  const root = items[0];
  return (
    <nav aria-label="مسیر صفحه" className="mb-2 text-xs text-text-secondary">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            to={root?.to ?? '/'}
            className="inline-flex min-h-8 items-center rounded-input px-1.5 hover:bg-surface hover:text-primary"
          >
            {title}
          </Link>
        </li>
        <li aria-hidden>
          <ChevronLeft className="size-3.5" />
        </li>
        <li>
          <Link
            to={current.to}
            className="inline-flex min-h-8 items-center rounded-input px-1.5 hover:bg-surface hover:text-primary"
          >
            {current.label}
          </Link>
        </li>
        <li aria-hidden>
          <ChevronLeft className="size-3.5" />
        </li>
        <li aria-current="page" className="px-1.5 font-bold text-text">
          جزئیات
        </li>
      </ol>
    </nav>
  );
}
