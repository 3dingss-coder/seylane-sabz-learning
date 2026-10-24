/** Lazy loaders for the marketer sub-pages, shared by the router (React.lazy) and the idle prefetch. */
export const marketerPages = {
  CardsPage: () => import('@/pages/m/CardsPage').then((m) => ({ default: m.CardsPage })),
  LearnPage: () => import('@/pages/m/LearnPage').then((m) => ({ default: m.LearnPage })),
  MentorPage: () => import('@/pages/m/MentorPage').then((m) => ({ default: m.MentorPage })),
  MessagesPage: () => import('@/pages/m/MessagesPage').then((m) => ({ default: m.MessagesPage })),
  PackagePage: () => import('@/pages/m/PackagePage').then((m) => ({ default: m.PackagePage })),
  ProfilePage: () => import('@/pages/m/ProfilePage').then((m) => ({ default: m.ProfilePage })),
  QuizPage: () => import('@/pages/m/QuizPage').then((m) => ({ default: m.QuizPage })),
  SectionPage: () => import('@/pages/m/SectionPage').then((m) => ({ default: m.SectionPage })),
};

/**
 * Download the sub-page chunks in the background once the home screen is up, so tapping
 * «شروع آزمون» / a package never waits on a chunk download (on a weak network that wait looked
 * like a dead button). Skipped when the user asked to save data.
 */
export function prefetchMarketerPages(): () => void {
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return () => undefined;
  const run = () => {
    for (const load of Object.values(marketerPages)) void load().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = setTimeout(run, 2000);
  return () => clearTimeout(t);
}
