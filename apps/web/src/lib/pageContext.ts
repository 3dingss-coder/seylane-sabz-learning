import { useEffect } from 'react';

const KEY = 'mentor.page.v1';
const TTL_MS = 10 * 60 * 1000;

export interface MentorPageContext {
  kind: 'learn' | 'brand' | 'package' | 'section' | 'quiz' | 'mentor';
  brandId?: string | null;
  brandName?: string | null;
  productId?: string | null;
  productName?: string | null;
  packageId?: string | null;
  packageTitle?: string | null;
  sectionId?: string | null;
  sectionTitle?: string | null;
  progressPercent?: number | null;
  activity: string[];
  updatedAt: string;
}

export type RememberInput = Partial<Omit<MentorPageContext, 'activity' | 'updatedAt'>> & {
  activityLine?: string;
};

function empty(): MentorPageContext {
  return { kind: 'learn', activity: [], updatedAt: new Date().toISOString() };
}

export function readPageContext(): MentorPageContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MentorPageContext;
    if (!parsed || typeof parsed !== 'object') return null;
    const age = Date.now() - Date.parse(parsed.updatedAt ?? '');
    if (!Number.isFinite(age) || age > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return { ...empty(), ...parsed, activity: Array.isArray(parsed.activity) ? parsed.activity : [] };
  } catch {
    return null;
  }
}

export function isSubjectRoute(pathname: string): boolean {
  return /^\/(learn|packages|sections|quiz|mentor)(\/|$)/.test(pathname);
}

/** Home, cards and messages are not a product page. Drop the old brand so the mentor does not keep answering about it. */
export function clearSubject(): void {
  const prev = readPageContext();
  if (!prev?.brandId && !prev?.productId && !prev?.packageId) return;
  rememberSubject({
    kind: 'learn',
    brandId: null,
    brandName: null,
    productId: null,
    productName: null,
    packageId: null,
    packageTitle: null,
    sectionId: null,
    sectionTitle: null,
    progressPercent: null,
  });
}

/**
 * Records the page the marketer is on. Opening the mentor tab must not call this with empty
 * brand/product fields — the last subject stays until a new page replaces it.
 */
export function rememberSubject(patch: RememberInput): void {
  const prev = readPageContext() ?? empty();
  const { activityLine, ...rest } = patch;
  const activity = activityLine
    ? [...prev.activity.filter((x) => x !== activityLine), activityLine].slice(-12)
    : prev.activity;
  const next: MentorPageContext = {
    ...prev,
    ...rest,
    activity,
    updatedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

/** Renders nothing. Safe to mount inside a query render-prop. */
export function RememberPage(props: RememberInput) {
  const sig = JSON.stringify(props);
  useEffect(() => {
    rememberSubject(JSON.parse(sig) as RememberInput);
  }, [sig]);
  return null;
}
