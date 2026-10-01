# Design Refresh — سیلانه‌سبز لرنینگ

UI/UX-only refresh of `apps/web`. No API, routing, state or business logic was changed (except the
two bug fixes listed under "Fixed on the way"). Screenshots: `docs/design-refresh/before/` and
`docs/design-refresh/after/` (file suffix `-m` = mobile 390×844 @2x, `-d` = desktop 1280×800;
`after/journey/` is the signup → onboarding → home → course → quiz pass → result walk-through,
`after/journey-dark/` the dark-scheme equivalents).

## 1. Audit (short)

| Area | Finding at the start |
| --- | --- |
| Tokens | Only the flat §16 palette and sm/md/lg shadows; no colour scale, gradients, motion tokens, keyframes, dark layer. |
| Shared UI | Button `transition-colors` only; Card flat; Modal with no enter/exit, no blur, no sheet handle; Toast static; ProgressBar animated `width` (breaks the transform-only rule); ProgressRing no mount fill; Skeleton = `animate-pulse`; Empty/Error states = icon tile only; KPI static. |
| Layouts | BottomNav static bar/badge; Sidebar flat and not full-height; no breadcrumbs; no page transition; **no ErrorBoundary**. |
| Pages | Home flat hero and Latin-only stats at 11px; Quiz no question transition / no review feedback / no focus ring on the `sr-only` radios; Mentor flat bubbles, plain "thinking" text; Cards (points/badges) plain; Auth/Onboarding plain card on flat bg; 404 plain tile. |
| Bug | `/mentor` rendered a **blank white page** in the baseline build (`MentorChat` effect returned the `scrollIntoView` result → React `destroy is not a function`). The "before" shot `m-mentor-*` documents it. |

## 2. Design direction

*Warm, credible, energetic — the same green, with depth.*

- **Identity kept:** primary `#177a50`, background `#f8fafc`, surface `#fff`, Vazirmatn, radius 8/12/16, 48px targets, breakpoints 640/1024/1280.
- **Depth, not decoration:** a brand scale derived from `#177a50`, one warm accent (amber) reserved for *rewards* (points, medals, streaks), layered soft shadows, subtle vertical gradient on the primary button, deep-green "hero" cards with a dot texture for the one thing that matters on a screen (Home next task, Cards points, Profile, Auth/Onboarding header).
- **Motion with purpose:** entry fade/slide with stagger, press scale 0.98, sliding nav marker, sheet/modal/toast enter+exit, progress fill + count-up, quiz selection/feedback/confetti. Everything is `transform`/`opacity`, 120–320 ms for interaction and ≤ 480 ms for page entry, ease `cubic-bezier(0.22,1,0.36,1)`.
- **Clean > fancy:** when fancy cost performance it lost (see §6).

## 3. New tokens (all in `@theme` of `apps/web/src/styles/index.css`)

- Brand scale `--color-primary-50 … 950` (600 = brand `#177a50`).
- Accent `--color-accent`, `--color-accent-light`, `--color-accent-fg` (text-safe).
- `--color-on-primary`, `--color-on-danger` (flip in dark mode to keep ≥ 4.5:1), `--color-scrim`, `--color-surface-2`.
- Radius `--radius-hero` (20px). Shadows `--shadow-xs`, `--shadow-brand`, `--shadow-inset-top` (sm/md/lg kept, re-tuned to layered soft shadows).
- Motion `--ease-soft`, `--ease-spring`, `--duration-fast/base/slow/enter` and the `--animate-*` set below.
- **Dark mode**: same token names re-mapped inside `@media (prefers-color-scheme: dark)` (no toggle, no component changed). It is OS-driven and verified with axe on every marketer/manager/admin page in both schemes.
- Utilities: `.glass`, `.bg-hero`, `.bg-brand-gradient`, `.bg-soft-brand`, `.bg-dots`, `.skeleton` (shimmer), `.stagger`, `.pressable`, `.page-enter`, `.rtl-mirror` (existing), `.num-latin` (existing).

## 4. Animation list

| Name | Where | Notes |
| --- | --- | --- |
| `page-enter` (opacity, 220 ms) | `PageTransition` in both layouts | re-runs per pathname |
| `stagger` + `fade-up` (480 ms, 50 ms steps, max 12) | list parents, KPI grids, DataTable rows, PublishGuide | |
| `pressable` (scale 0.98) | Button, cards, rows | |
| sliding marker | BottomNav (translateX), Sidebar (translateY) | active item also matched through `match` aliases (`lib/navMatch.ts`) |
| `sheet-in/out`, `scale-in/out`, `fade-out` + blur backdrop | Modal (sheet on mobile with handle, centred card on desktop) | exit delayed via `usePresence`/`exitDelay` |
| `toast-in/out` | Toast | spring ease |
| ProgressRing fill / ProgressBar (`scaleX`) / `CountUp` (Persian digits) | Home, KPI, Cards, results | `useCountUp`, `useMountedFlag` in `lib/motion.ts` |
| `pop`, `check-draw`, `shake`, `confetti-fall` | Quiz selection, result review (✓ pop / ✗ shake), pass result | confetti is ~24 CSS particles, no library |
| `pulse-dot` (1 iteration) | new-notification badge, urgent deadline chip | |
| `float`, `blink` | illustrations / mentor empty state, typing indicator | |
| `shimmer` | `.skeleton` in lists | |
| Question slide | Quiz (`slide-in-start/end`) | |

Under `prefers-reduced-motion: reduce` every animation and transition collapses to ~0 ms with a single iteration (no infinite loops), JS count-ups/ring fills/exit delays are skipped (`motionOff()`), and the same switch is on under vitest.

## 5. Libraries added

**None.** Everything is CSS/Tailwind + three tiny hooks (`useCountUp`, `useMountedFlag`, `usePresence` in `lib/motion.ts`). No `motion`/`framer-motion`/lottie: nothing in the brief needed spring physics or timeline orchestration that CSS could not do within the performance budget. Production JS grew 129.3 → ~134 kB gzip, CSS 8.0 → ~12.3 kB gzip (new tokens, utilities, dark layer, keyframes).

## 6. Performance: what we measured and what we changed

Lighthouse (mobile preset, `vite preview` of the production build, same machine/browser for baseline and refresh; the lab uses a software rasterizer so absolute numbers are pessimistic, compare relative):

| | baseline | refresh (first pass) | refresh (final) |
| --- | --- | --- | --- |
| `/` home perf / TBT | 96–100 / 4–250 ms | **70 / 3–5 s** | 92–100 typ. (one noisy run ≈ 80) / 0–400 ms |
| `/login` | 95 | 95 | 95 |
| `/learn`, `/profile`, `/mentor` | — | 100 | 100 |
| a11y / best-practices | 98–100 / 100 | 95–100 / 100 | 98–100 / 100 |

The first pass was a real regression. Findings and fixes:

1. **`backdrop-filter` on the sticky header, bottom-nav and mentor launcher** re-blurs every frame → removed from mobile. `.glass` is a 92 % translucent fill on mobile; the real `blur(12px)` is enabled from `min-width:1024px` + `hover:hover`. The Modal backdrop keeps its blur (transient, only while open).
2. **Entry animations on a cold load** (stagger, page-enter, count-up, ring fill, pulses) were rastered while the page was still booting. They now **arm on the first interaction** (`armMotionOnInteraction()` sets `<html data-motion>` on first pointer/key/touch; `lib/motion.ts`, gate at the end of `index.css`). A cold start paints final content immediately (nothing delays LCP); every navigation after the first tap is animated. Real flows (login → home) are always animated because login needs a tap. Only a returning user with a stored session sees a static first paint.
3. **The Home hero card** cost ~300 ms of raster in the lab until it got its own compositor layer (`[will-change:transform]` on `Card tone="hero"`, found by bisecting with a trace).
4. **Product-image placeholder** is a static `bg-surface-2` tile (no shimmer per image) and images no longer cross-fade (an opacity transition on many images cost a full compositor draw).
5. Pulses are one iteration, not infinite.

Images: `ProductImage` has a fixed aspect box (`width/height`, no layout shift), `loading="lazy"`, `decoding="async"`, and an always-white tile so logos/photos stay legible in dark mode.

## 7. Accessibility checks performed

- `a11y.test.tsx` (jest-axe) still passes; unit tests: 13 files / 69 tests.
- **axe-core in real Chromium (wcag2a/2aa/21aa incl. colour-contrast)** on: register, onboarding, home, learn, package, section, quiz (start / question / result), mentor, messages, cards, profile, all admin pages (dashboard, content, users, teams, reports, policies, audit, notifications, assignments) and manager pages (dashboard, reports, retakes) — light **and** dark. All clean after fixing the locked-badge contrast on `/cards` (which had `opacity-70` on text; found by this run).
- Focus: the global 2px `info` outline is kept; form fields add a soft 4px halo; quiz options now show a focus ring (previously none on the `sr-only` radios).
- Directional icons use `.rtl-mirror`; logical properties throughout; Persian digits via `toPersianDigits`/`faNumber`.
- **Deliberately unchanged:** countdown values (`1d 23h`) stay in Latin digits — PRODUCT-MASTER-SPEC §16.3 requires it for countdowns.

## 8. Fixed on the way

- `/mentor` white page (effect returned a value) — `MentorChat.tsx`.
- New `ErrorBoundary` (`components/ui/ErrorBoundary.tsx`), mounted as `RouteGuard` in `App.tsx`, resets on route change, retry + "home" actions. **Follow-up:** it does not report to Sentry yet (`lib/telemetry.ts` exposes only `track`, `initMonitoring`, `setCrashUser`).
- Quiz "Next" button content wrapped so the chevron no longer drops to its own line.
- Manager/admin `PanelLayout` sidebar now spans the full height.

## 9. Not touched / risks

- Logic, API, routing, auth/session, PWA/service-worker, Capacitor/native code, Cloud Functions, seed data, e2e specs.
- Seed oddity, not ours: the manager title reads «تیم تیم فروش تهران» because the seeded team name already starts with «تیم».
- `/cards` CLS ≈ 0.28 and a11y 95 in Lighthouse pre-exist (same in baseline); contrast was fixed, the badge section shift (late data) is left alone.
- Risk: `ProductImage` stays invisible until `onLoad` (never fires in jsdom) — existing tests pass because Tailwind isn't loaded there.
- Risk: `Breadcrumb` adds text on admin/manager detail pages; tests that use `getByText` on those titles should scope their queries.
- Risk: `CountUp` shows «۰» for one frame before counting when motion is armed; under `prefers-reduced-motion`/tests it is immediate.
- Risk: `will-change:transform` on hero cards uses a little GPU memory (one card per screen).
- The emoji in the greeting renders as a box in the headless screenshot browser (no emoji font there); real devices are fine.
- The brief asked for branch `design/ui-refresh` and a PR. This session was pinned to `arena/01a0efbe-seylane-sabz-learning`, so the work is on that branch; open the PR from it.

## 10. Stages (one commit each)

a. tokens / base layer · b. shared `components/ui/*` · c. layouts & navigation · d. marketer pages, Auth/Onboarding, 404, ErrorBoundary · e. manager/admin polish + new UI tests · f. performance pass and docs.
