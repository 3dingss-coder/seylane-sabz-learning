import type { Role } from './types';

/** Which panel a path belongs to (UI mirror of server RBAC; the API enforces the real rules). */
export function panelOf(path: string): 'admin' | 'manager' | 'marketer' | 'public' {
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (path === '/manager' || path.startsWith('/manager/')) return 'manager';
  if (/^\/(login|register|forgot-password|gallery)(\/|$)/.test(path)) return 'public';
  return 'marketer';
}

export function canAccess(role: Role, path: string): boolean {
  const panel = panelOf(path);
  if (panel === 'public') return true;
  if (panel === 'admin') return role === 'admin' || role === 'superadmin';
  if (panel === 'manager') return role === 'manager';
  return role === 'marketer';
}

export const PANEL_LABEL = { admin: 'پنل ادمین', manager: 'پنل مدیر', marketer: 'اپ بازاریاب' };
