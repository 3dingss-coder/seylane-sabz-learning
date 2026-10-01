import type { SidebarItem } from '@/components/layout/Sidebar';

/** Same "end" rule the NavLinks use: top-level entries match exactly, deeper ones by prefix. */
export function isItemActive(pathname: string, item: SidebarItem): boolean {
  const exact = item.to.split('/').length <= 2;
  if (exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))
    return true;
  return (item.match ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
