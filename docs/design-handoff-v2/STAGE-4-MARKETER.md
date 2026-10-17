# Stage 4 — Marketer (Report)

> **Status:** Implemented and gated. All marketer functions (next task,
> start/continue/quiz CTA states, mentor nudge, overall progress, metrics,
> points, overdue warning, my trainings, bottom nav, the full mentor
> capability set, messages/cards/profile + notification prefs) are preserved.
> Changes are presentation-only per the handoff marketer spec.

## Handoff rules applied (`04-page-specs/marketer.md`)

- Core principle: the home screen instantly answers «What should I do next?» —
  the dominant next-action focal card was already the pattern and is kept as
  the single focal card, with progress/context below (unchanged structure).
- Mascot may support **empty, success, encouragement and mentor** states but
  must not overwhelm utility screens; never more than one pose per screen.
- Mentor keeps every real capability: text, mic, voice call, image, text-file,
  link/reference, answer sources, feedback — untouched code paths, the new
  tests pin suggestions + question input + attachment entry.

## Changes (presentation only)

- `components/ui/EmptyState.tsx`: additive `illustration?: ReactNode` slot
  (replaces the default illustration; every existing call site unchanged).
- `pages/m/HomePage.tsx`:
  - empty state → mascot `thinking` (allowed empty state);
  - all-done success card → mascot `success` (allowed success state) in place
    of the decorative TrophyIllustration (presentation art swap only);
  - **no mascot on the routine home screen** (one-next-action stays the focal
    point; pinned by a test).
- `pages/m/LearnPage.tsx`, `pages/m/MessagesPage.tsx` (both tab empties),
  `pages/m/CardsPage.tsx` (points-ledger empty): small mascot in empty states
  only (`thinking`, `guide` for the points encouragement copy).
- `pages/m/MentorPage.tsx` + `components/learning/MentorChat.tsx`: the mentor
  avatar/greeting uses the mascot `welcome` state (allowed mentor states);
  suggestions and input unchanged.
- Utility screens (Profile, Messages list states, package/section/quiz
  screens): no new mascot presence; semantic status colors untouched
  (overdue warning stays danger-semantic). Verified the amber/energy rule:
  the points hero keeps white text on the deep-green hero surface and all
  amber uses dark text (`accent-fg` on light, `text-accent-fg` on `bg-accent`
  tiles) — no white-on-amber anywhere.

## Regression pinning (new tests)

`pages/m/marketer.test.tsx` (6 tests):

1. home renders the next-action card + «شروع» CTA, metrics, points link,
   «آموزش‌های من» + package card;
2. routine home has **no mascot** (must-not-overwhelm rule);
3. empty home carries the decorative mascot (`alt=""`);
4. all-done home shows the success message + mascot;
5. MentorPage keeps suggestions + question input + attachment entry, with the
   decorative mentor mascot;
6. EmptyState `illustration` slot renders custom visuals.

## Gates (on the final code)

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| prettier (changed files) | ✅ pass |
| `npm run test -w apps/web` | ✅ 44 files, 348 tests (342 baseline + 6 new) |
| `npm run build -w apps/web` | ✅ pass |

## Explicitly unchanged

All marketer API calls (`/me/home`, `/me/mentor/*`, `/me/points`, `/me/badges`,
notifications/messages), quiz/retake logic, SectionPage media flows, upload
flows, notification preference controls, route table, bottom-nav behaviour,
highlightNext state, offline last-known cache, dark mode, reduced motion.
No Cloudflare/production verification is claimed.

## Session note

The sandbox was recreated mid-session (fresh clone); the local branch pointer
was recovered to the pushed tip `91a1e00` and `npm ci` + the functions
seed-snapshot artifact were regenerated before gating.

## Next

Stage 5 — Manager (desktop-first team cockpit). Not started.
