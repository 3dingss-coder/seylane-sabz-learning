import { createHash } from 'node:crypto';

/** Deterministic document ids (idempotency + uniqueness without queries). */
export const ids = {
  attempt: (userId: string, quizId: string, n: number) => `${userId}_${quizId}_${n}`,
  progress: (userId: string, sectionId: string) => `${userId}_${sectionId}`,
  points: (userId: string, reason: string, refId: string) => `${userId}_${reason}_${refId}`,
  userBadge: (userId: string, badgeId: string) => `${userId}_${badgeId}`,
  escalation: (userId: string, packageId: string, type: string) => `${userId}_${packageId}_${type}`,
  uniqueKey: (kind: 'phone' | 'email', value: string) => `${kind}_${createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 40)}`,
  hash: (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40),
};

/** Iranian mobile normalisation → 09xxxxxxxxx (accepts +98 / 0098 / Persian digits). */
export function normalizePhone(input: string): string | null {
  const latin = input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\-()]/g, '');
  let p = latin;
  if (p.startsWith('+98')) p = `0${p.slice(3)}`;
  else if (p.startsWith('0098')) p = `0${p.slice(4)}`;
  else if (p.startsWith('98') && p.length === 12) p = `0${p.slice(2)}`;
  else if (p.startsWith('9') && p.length === 10) p = `0${p}`;
  return /^09\d{9}$/.test(p) ? p : null;
}

/** D35: phone users authenticate with a synthetic email. */
export const PHONE_EMAIL_DOMAIN = 'phone.seylane-sabz.app';
export function phoneToAuthEmail(phone: string): string {
  return `${phone}@${PHONE_EMAIL_DOMAIN}`;
}

export function extractYoutubeId(url: string): string | null {
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
